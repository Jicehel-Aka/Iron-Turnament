/*
===============================================================================
  netplay.cpp — Session « lockstep », framage serie, condense d'etat (cf. netplay.h)
===============================================================================
*/
#include "netplay.h"
#include <cstring>

namespace fight { namespace net {

// ---------------------------------------------------------------------------
// CRC-16/CCITT-FALSE
// ---------------------------------------------------------------------------
uint16_t crc16(const uint8_t* d, size_t n) {
    uint16_t c = 0xFFFF;
    for (size_t i = 0; i < n; ++i) {
        c ^= (uint16_t)d[i] << 8;
        for (int k = 0; k < 8; ++k) c = (c & 0x8000) ? (uint16_t)((c << 1) ^ 0x1021) : (uint16_t)(c << 1);
    }
    return c;
}

// ---------------------------------------------------------------------------
// SLIP + CRC
// ---------------------------------------------------------------------------
static constexpr uint8_t SL_END = 0xC0, SL_ESC = 0xDB, SL_ESC_END = 0xDC, SL_ESC_ESC = 0xDD;

bool SlipTransport::send(const uint8_t* data, size_t n) {
    if (n > (size_t)MAX_PACKET) return false;
    uint8_t out[2 * (MAX_PACKET + 2) + 2];
    size_t o = 0;
    out[o++] = SL_END;
    auto put = [&](uint8_t b) {
        if (b == SL_END)      { out[o++] = SL_ESC; out[o++] = SL_ESC_END; }
        else if (b == SL_ESC) { out[o++] = SL_ESC; out[o++] = SL_ESC_ESC; }
        else                    out[o++] = b;
    };
    for (size_t i = 0; i < n; ++i) put(data[i]);
    const uint16_t c = crc16(data, n);
    put((uint8_t)(c >> 8)); put((uint8_t)c);
    out[o++] = SL_END;

    size_t done = 0;
    for (int guard = 0; done < o && guard < 8; ++guard) {
        const int w = s_.write(out + done, o - done);
        if (w <= 0) break;
        done += (size_t)w;
    }
    return done == o;
}

int SlipTransport::recv(uint8_t* buf, size_t max) {
    for (;;) {
        if (in_pos_ >= in_len_) {
            in_pos_ = 0;
            const int r = s_.read(in_, sizeof in_);
            in_len_ = r > 0 ? r : 0;
            if (in_len_ == 0) return 0;
        }
        const uint8_t b = in_[in_pos_++];
        if (b == SL_END) {
            const bool ok = !overflow_ && !esc_ && rx_n_ >= 3;
            size_t n = rx_n_;
            rx_n_ = 0; esc_ = false; overflow_ = false;
            if (ok) {
                const size_t pl = n - 2;
                const uint16_t c = (uint16_t)((rx_[pl] << 8) | rx_[pl + 1]);
                if (c == crc16(rx_, pl) && pl <= max) { std::memcpy(buf, rx_, pl); return (int)pl; }
            }
            continue;
        }
        uint8_t v = b;
        if (esc_) {
            esc_ = false;
            if (b == SL_ESC_END) v = SL_END;
            else if (b == SL_ESC_ESC) v = SL_ESC;
            else { overflow_ = true; continue; }
        } else if (b == SL_ESC) { esc_ = true; continue; }
        if (rx_n_ < sizeof rx_) rx_[rx_n_++] = v; else overflow_ = true;
    }
}

// ---------------------------------------------------------------------------
// Entrees
// ---------------------------------------------------------------------------
uint16_t pack_input(const Input& in) {
    return (uint16_t)((in.left ? 1 : 0) | (in.right ? 2 : 0) | (in.up ? 4 : 0) | (in.down ? 8 : 0) |
                      (in.a ? 16 : 0) | (in.b ? 32 : 0) | (in.special ? 64 : 0) |
                      (in.jp_a ? 128 : 0) | (in.jp_b ? 256 : 0) | (in.jp_special ? 512 : 0));
}

Input unpack_input(uint16_t v) {
    Input in;
    in.left = v & 1; in.right = v & 2; in.up = v & 4; in.down = v & 8;
    in.a = v & 16; in.b = v & 32; in.special = v & 64;
    in.jp_a = v & 128; in.jp_b = v & 256; in.jp_special = v & 512;
    return in;
}

// ---------------------------------------------------------------------------
// Condense d'etat : FNV-1a sur l'etat de JEU (pas les particules, ni l'affichage).
// ---------------------------------------------------------------------------
namespace {
struct Fnv {
    uint32_t h = 2166136261u;
    void u8(uint32_t v)  { h = (h ^ (v & 0xFF)) * 16777619u; }
    void u32(uint32_t v) { u8(v); u8(v >> 8); u8(v >> 16); u8(v >> 24); }
    void f(float v)      { uint32_t b; std::memcpy(&b, &v, 4); u32(b); }
};
} // namespace

uint32_t hash_match(const Match& m) {
    Fnv h;
    h.u32((uint32_t)m.frame); h.u8(m.round); h.u8(m.wins[0]); h.u8(m.wins[1]);
    h.u32((uint32_t)m.timer_frames); h.u32((uint32_t)m.hitstop); h.u8(m.phase); h.u32((uint32_t)m.phase_timer);
    h.u32(m.rng); h.u8(m.winner_slot); h.u8(m.finisher_done);
    for (int i = 0; i < 2; ++i) {
        const Fighter& f = m.f[i];
        h.u8(f.id); h.f(f.x); h.f(f.y); h.f(f.vx); h.f(f.vy); h.u8((uint8_t)f.facing);
        h.u32((uint32_t)f.hp); h.u8(f.ki); h.u8(f.power); h.u8(f.action);
        h.u32((uint32_t)f.action_frame); h.u8(f.combo_count); h.u32((uint32_t)f.combo_timer);
        h.u32((uint32_t)f.invuln); h.u8(f.hit_confirmed); h.u32((uint32_t)f.ai_cooldown);
        h.u8(f.buf_a); h.u8(f.buf_b); h.u8(f.buf_sp);
        h.u8(f.rep_kind); h.u8(f.rep_count); h.u8(f.rep_timer); h.u8(f.spam); h.u8(f.riposte);
    }
    for (int i = 0; i < MAX_PROJ; ++i) {
        const Projectile& p = m.proj[i];
        h.u8(p.alive);
        if (!p.alive) continue;
        h.u8(p.owner); h.u8(p.kind); h.f(p.x); h.f(p.y); h.f(p.vx); h.u32((uint32_t)p.damage); h.u32((uint32_t)p.life);
    }
    return h.h;
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------
namespace {
enum : uint8_t { PK_HELLO = 1, PK_START = 2, PK_INPUT = 3, PK_BYE = 4 };
constexpr uint8_t MAGIC0 = 0x49, MAGIC1 = 0x54;           // "IT"
constexpr uint32_t HELLO_PERIOD_MS = 250;
constexpr uint32_t LINK_TIMEOUT_MS = 5000;
constexpr uint32_t CONNECT_TIMEOUT_MS = 120000;

inline void put32(uint8_t* p, uint32_t v) { p[0] = (uint8_t)v; p[1] = (uint8_t)(v >> 8); p[2] = (uint8_t)(v >> 16); p[3] = (uint8_t)(v >> 24); }
inline uint32_t get32(const uint8_t* p) { return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24); }
inline void put16(uint8_t* p, uint32_t v) { p[0] = (uint8_t)v; p[1] = (uint8_t)(v >> 8); }
inline uint32_t get16(const uint8_t* p) { return (uint32_t)p[0] | ((uint32_t)p[1] << 8); }
} // namespace

Session::Session(Transport& t, bool host, uint8_t my_fighter, const NetOptions& opt, uint32_t seed)
    : t_(t), host_(host), my_(my_fighter), p1_(my_fighter), p2_(my_fighter), seed_(seed ? seed : 1u), opt_(opt) {
    if (opt_.input_delay < 1) opt_.input_delay = 1;
    if (opt_.input_delay > 8) opt_.input_delay = 8;
    std::memset(local_in_, 0, sizeof local_in_);
    std::memset(remote_in_, 0, sizeof remote_in_);
    std::memset(mine_, 0, sizeof mine_);
    std::memset(theirs_, 0, sizeof theirs_);
}

void Session::send_bye(uint8_t reason) {
    uint8_t p[4] = { MAGIC0, MAGIC1, PK_BYE, reason };
    for (int i = 0; i < 3; ++i) t_.send(p, sizeof p);
}

void Session::fail(NetError e) {
    if (state_ != NS_RUNNING && state_ != NS_CONNECTING) return;
    state_ = NS_FAILED;
    err_ = e;
    if (e == NE_DESYNC) send_bye(NE_DESYNC);            // l'adversaire doit voir la meme erreur, pas un « delai depasse »
}

void Session::send_hello() {
    uint8_t p[5] = { MAGIC0, MAGIC1, PK_HELLO, PROTO_VERSION, my_ };
    t_.send(p, sizeof p);
}

void Session::send_start() {
    uint8_t p[14] = { MAGIC0, MAGIC1, PK_START, PROTO_VERSION, p1_, p2_, opt_.rounds_to_win };
    put16(p + 7, opt_.round_sec);
    p[9] = opt_.input_delay;
    put32(p + 10, seed_);
    t_.send(p, sizeof p);
}

void Session::send_inputs() {
    uint32_t first = peer_next_;
    if (local_sent_ > (uint32_t)REDUNDANCY && first + REDUNDANCY < local_sent_) first = local_sent_ - REDUNDANCY;
    if (first >= local_sent_) first = local_sent_ - 1;           // au moins le dernier tick : sert de signe de vie
    const uint32_t n = local_sent_ - first;
    uint8_t p[MAX_PACKET];
    p[0] = MAGIC0; p[1] = MAGIC1; p[2] = PK_INPUT;
    put32(p + 3, first);
    p[7] = (uint8_t)n;
    put32(p + 8, remote_next_);
    put32(p + 12, last_mine_.tick);
    put32(p + 16, last_mine_.hash);
    for (uint32_t i = 0; i < n; ++i) put16(p + 20 + 2 * i, local_in_[(first + i) % RING]);
    t_.send(p, 20 + 2 * n);
}

void Session::poll(uint32_t now_ms) {
    now_ = now_ms;
    if (start_ms_ == 0) { start_ms_ = now_ms ? now_ms : 1; last_rx_ms_ = now_ms; }

    uint8_t buf[MAX_PACKET + 8];
    for (int i = 0; i < 24; ++i) {
        const int n = t_.recv(buf, sizeof buf);
        if (n <= 0) break;
        on_packet(buf, n, now_ms);
    }

    if (state_ == NS_CONNECTING) {
        if (!host_ && (!hello_sent_ || now_ms - last_hello_ms_ >= HELLO_PERIOD_MS)) { hello_sent_ = true; last_hello_ms_ = now_ms; send_hello(); }
        if (now_ms - start_ms_ > CONNECT_TIMEOUT_MS) fail(NE_TIMEOUT);
    } else if (state_ == NS_RUNNING) {
        if (now_ms - last_rx_ms_ > LINK_TIMEOUT_MS) fail(NE_TIMEOUT);
    }
    if (!t_.alive()) fail(NE_LINK);
}

void Session::on_packet(const uint8_t* p, int n, uint32_t now_ms) {
    if (n < 3 || p[0] != MAGIC0 || p[1] != MAGIC1) return;
    const uint8_t type = p[2];

    auto begin_running = [&]() {
        const uint32_t d = opt_.input_delay;
        for (uint32_t t = 0; t < d; ++t) { local_in_[t % RING] = 0; remote_in_[t % RING] = 0; }
        local_sent_ = remote_next_ = peer_next_ = d;
        sim_ = 0;
        state_ = NS_RUNNING;
    };

    if (type == PK_HELLO && host_ && n >= 5) {
        last_rx_ms_ = now_ms;
        if (p[3] != PROTO_VERSION) { fail(NE_VERSION); return; }
        if (state_ == NS_CONNECTING) {
            p1_ = my_; p2_ = p[4];
            begin_running();
        }
        send_start();
    } else if (type == PK_START && !host_ && n >= 14) {
        last_rx_ms_ = now_ms;
        if (p[3] != PROTO_VERSION) { fail(NE_VERSION); return; }
        if (state_ == NS_CONNECTING) {
            p1_ = p[4]; p2_ = p[5];
            opt_.rounds_to_win = p[6];
            opt_.round_sec = (uint16_t)get16(p + 7);
            opt_.input_delay = p[9] < 1 ? 1 : (p[9] > 8 ? 8 : p[9]);
            seed_ = get32(p + 10);
            begin_running();
        }
    } else if (type == PK_INPUT && state_ == NS_RUNNING && n >= 20) {
        last_rx_ms_ = now_ms;
        const uint32_t first = get32(p + 3);
        const uint32_t cnt = p[7];
        const uint32_t ack = get32(p + 8);
        if (n < (int)(20 + 2 * cnt)) return;
        if (ack > peer_next_ && ack <= local_sent_) peer_next_ = ack;
        for (uint32_t i = 0; i < cnt; ++i) {
            const uint32_t t = first + i;
            if (t == remote_next_ && remote_next_ < sim_ + RING / 2) {
                remote_in_[t % RING] = (uint16_t)get16(p + 20 + 2 * i);
                remote_next_++;
            }
        }
        const uint32_t ckt = get32(p + 12);
        if (ckt != 0) { theirs_[(ckt / 30) % CK] = Ck{ ckt, get32(p + 16) }; check_checkpoints(); }
    } else if (type == PK_BYE) {
        fail(n >= 4 && p[3] == NE_DESYNC ? NE_DESYNC : NE_PEER_LEFT);
    }
}

bool Session::tick(const Input& local, Input& p1, Input& p2) {
    if (state_ != NS_RUNNING) return false;

    if (local_sent_ < sim_ + opt_.input_delay) {
        local_in_[local_sent_ % RING] = pack_input(local);
        local_sent_++;
    }
    send_inputs();

    if (sim_ < remote_next_) {
        const Input mine = unpack_input(local_in_[sim_ % RING]);
        const Input peer = unpack_input(remote_in_[sim_ % RING]);
        if (host_) { p1 = mine; p2 = peer; } else { p1 = peer; p2 = mine; }
        sim_++;
        stall_ = 0;
        return true;
    }
    stall_++;
    return false;
}

void Session::check_checkpoints() {
    for (int i = 0; i < CK; ++i)
        if (mine_[i].tick && mine_[i].tick == theirs_[i].tick && mine_[i].hash != theirs_[i].hash) fail(NE_DESYNC);
}

void Session::on_simulated(const Match& m) {
    if (sim_ == 0 || sim_ % 30 != 0) return;
    last_mine_ = Ck{ sim_, hash_match(m) };
    mine_[(sim_ / 30) % CK] = last_mine_;
    check_checkpoints();
}

void Session::leave() {
    if (state_ == NS_RUNNING || state_ == NS_CONNECTING) {
        send_bye(NE_PEER_LEFT);
        state_ = NS_CLOSED;
    }
}

}} // namespace fight::net
