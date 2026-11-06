/*
  net_test.cpp — Tests du mode reseau (lockstep) : liaison simulee avec pertes, doublons, retards,
  desynchronisation, coupure, framage serie. Aucun materiel ni socket requis.

      g++ -std=c++17 -O2 -Wall -Wextra -Werror -I main/games/fight test/net_test.cpp \
          main/games/fight/fight_data.cpp main/games/fight/fight_engine.cpp main/games/fight/fight_ai.cpp \
          main/games/fight/netplay.cpp -o net_test && ./net_test
*/
#include "netplay.h"
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <deque>
#include <set>
#include <string>
#include <vector>

using namespace fight;
using namespace fight::net;

static int g_fail = 0, g_checks = 0;
#define CHECK(c) do { ++g_checks; if (!(c)) { ++g_fail; std::printf("  ECHEC ligne %d : %s\n", __LINE__, #c); } } while (0)

// --- generateur deterministe propre aux tests -------------------------------------------------------
struct Rng { uint32_t s; uint32_t next() { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return s; } float f() { return (next() & 0xFFFFFF) / 16777216.0f; } };

// --- liaison simulee ---------------------------------------------------------------------------------
struct Wire {
    struct Pkt { std::vector<uint8_t> d; uint32_t due; };
    std::deque<Pkt> q;
};
struct SimLink : Transport {
    Wire* out; Wire* in; const uint32_t* clock; Rng* rng;
    float loss = 0, dup = 0; uint32_t min_ms = 0, max_ms = 0; bool dead = false;
    bool send(const uint8_t* d, size_t n) override {
        if (dead || rng->f() < loss) return true;
        const int copies = rng->f() < dup ? 2 : 1;
        for (int i = 0; i < copies; ++i) {
            const uint32_t delay = min_ms + (max_ms > min_ms ? rng->next() % (max_ms - min_ms + 1) : 0);
            out->q.push_back({ std::vector<uint8_t>(d, d + n), *clock + delay });
        }
        return true;
    }
    int recv(uint8_t* buf, size_t max) override {
        // Livre le premier paquet arrive a echeance (l'ordre peut etre bouscule par les retards inegaux).
        for (size_t i = 0; i < in->q.size(); ++i) {
            if (in->q[i].due <= *clock) {
                const size_t n = in->q[i].d.size() < max ? in->q[i].d.size() : max;
                std::memcpy(buf, in->q[i].d.data(), n);
                in->q.erase(in->q.begin() + (long)i);
                return (int)n;
            }
        }
        return 0;
    }
};

// --- un joueur simule : session + combat local ------------------------------------------------------
struct Player {
    Session* s = nullptr;
    Match    m;
    bool     inited = false;
    int      end_steps = 0;
    Input    prev;
    Rng      rng;
    std::vector<uint32_t> hashes;                      // condense a chaque multiple de 30 ticks

    Input local_input(uint32_t frame) {
        static const int kHold[] = { 0, 1, 2, 4, 8 };
        Input in = prev;
        if (frame % 5 == 0) {
            const uint32_t r = rng.next();
            in.left = (r & 3) == 0; in.right = (r & 3) == 1;
            in.up = ((r >> 3) & 15) == 0; in.down = ((r >> 7) & 7) == 0;
            in.a = ((r >> 10) & 3) == 0; in.b = ((r >> 12) & 3) == 0; in.special = ((r >> 14) & 7) == 0;
            (void)kHold;
        }
        in.jp_a = in.a && !prev.a; in.jp_b = in.b && !prev.b; in.jp_special = in.special && !prev.special;
        prev = in;
        return in;
    }

    // Une image de 30 fps, comme fight_module::update en mode reseau.
    void frame(uint32_t now, uint32_t n) {
        s->poll(now);
        if (s->state() != NS_RUNNING) return;
        if (!inited) {
            MatchRules r; r.rounds_to_win = s->options().rounds_to_win; r.round_sec = s->options().round_sec;
            init_match(m, (FighterId)s->p1_fighter(), (FighterId)s->p2_fighter(), false, s->seed(), r);
            inited = true;
        }
        Input p1, p2;
        if (!s->tick(local_input(n), p1, p2)) return;
        for (int k = 0; k < 2; ++k) {
            Input a = p1, b = p2;
            if (k == 1) { a.jp_a = a.jp_b = a.jp_special = false; b.jp_a = b.jp_b = b.jp_special = false; }
            step_match_2p(m, a, b);
            m.sfx = 0;
            if (m.phase == PH_ROUND_END && m.winner_slot) {
                const int hold = m.finisher_done != FIN_NONE ? 170 : 110;
                if (++end_steps >= hold) {
                    end_steps = 0;
                    if (m.wins[0] < m.rounds_to_win && m.wins[1] < m.rounds_to_win) start_next_round(m);
                }
            } else end_steps = 0;
        }
        s->on_simulated(m);
        if (s->sim_tick() % 30 == 0) hashes.push_back(hash_match(m));
    }
};

struct Duel {
    Wire ab, ba; Rng lr{777};
    SimLink la, lb; uint32_t clock = 1000;
    NetOptions opt;
    Session* sa = nullptr; Session* sb = nullptr;
    Player pa, pb;
    Duel(float loss, float dup, uint32_t min_ms, uint32_t max_ms, uint8_t fa = KENJI, uint8_t fb = TITAN, uint8_t delay = 3) {
        la.out = &ab; la.in = &ba; lb.out = &ba; lb.in = &ab;
        la.clock = lb.clock = &clock; la.rng = lb.rng = &lr;
        la.loss = lb.loss = loss; la.dup = lb.dup = dup;
        la.min_ms = lb.min_ms = min_ms; la.max_ms = lb.max_ms = max_ms;
        opt.input_delay = delay;
        sa = new Session(la, true, fa, opt, 424242);
        sb = new Session(lb, false, fb, NetOptions{}, 0);
        pa.s = sa; pb.s = sb; pa.rng.s = 11; pb.rng.s = 99;
    }
    ~Duel() { delete sa; delete sb; }
    void run(uint32_t frames) {
        for (uint32_t i = 0; i < frames; ++i) {
            clock += 33;
            pa.frame(clock, i);
            pb.frame(clock, i);
        }
    }
    bool hashes_agree() const {
        const size_t n = pa.hashes.size() < pb.hashes.size() ? pa.hashes.size() : pb.hashes.size();
        for (size_t i = 0; i < n; ++i) if (pa.hashes[i] != pb.hashes[i]) return false;
        return n > 0;
    }
};

static void test_basics() {
    std::printf("[entrees / crc]\n");
    for (uint32_t v = 0; v < 1024; ++v) CHECK(pack_input(unpack_input((uint16_t)v)) == v);
    const uint8_t abc[] = { '1','2','3','4','5','6','7','8','9' };
    CHECK(crc16(abc, 9) == 0x29B1);                    // valeur de reference CRC-16/CCITT-FALSE
}

static void test_clean_link() {
    std::printf("[liaison parfaite]\n");
    Duel d(0, 0, 0, 0);
    d.run(2400);                                       // 80 s de combat
    CHECK(d.sa->state() == NS_RUNNING && d.sb->state() == NS_RUNNING);
    CHECK(d.sa->p1_fighter() == KENJI && d.sa->p2_fighter() == TITAN);
    CHECK(d.sb->p1_fighter() == KENJI && d.sb->p2_fighter() == TITAN);     // l'invite recoit le choix de l'hote
    CHECK(d.sa->sim_tick() > 2200 && d.sb->sim_tick() > 2200);
    CHECK(d.hashes_agree());
    CHECK(d.pa.hashes.size() > 70);
    CHECK(d.pa.m.frame > 4000);
    const int dmg = (d.pa.m.f[0].max_hp - d.pa.m.f[0].hp) + (d.pa.m.f[1].max_hp - d.pa.m.f[1].hp) + d.pa.m.wins[0] + d.pa.m.wins[1];
    CHECK(dmg > 0);                                    // les entrees ont reellement agi
}

static void test_lossy_link() {
    std::printf("[liaison degradee : 25%% de perte, doublons, retards 0-130 ms]\n");
    for (int seed = 1; seed <= 4; ++seed) {
        Duel d(0.25f, 0.10f, 0, 130, (uint8_t)(seed % 6), (uint8_t)((seed + 2) % 6), (uint8_t)(2 + seed % 3));
        d.lr.s = 1000u + (uint32_t)seed;
        d.pa.rng.s = 5u + (uint32_t)seed; d.pb.rng.s = 50u + (uint32_t)seed;
        d.run(3600);
        CHECK(d.sa->state() == NS_RUNNING && d.sb->state() == NS_RUNNING);
        CHECK(d.hashes_agree());
        CHECK(d.sa->sim_tick() > 1500);                // la perte ralentit mais ne bloque pas
    }
}

static void test_dead_link() {
    std::printf("[coupure]\n");
    Duel d(0, 0, 0, 0);
    d.run(300);
    CHECK(d.sa->state() == NS_RUNNING);
    d.la.dead = d.lb.dead = true;
    d.run(200);                                        // 6,6 s sans rien
    CHECK(d.sa->state() == NS_FAILED && d.sa->error() == NE_TIMEOUT);
    CHECK(d.sb->state() == NS_FAILED && d.sb->error() == NE_TIMEOUT);
}

static void test_peer_leaves() {
    std::printf("[depart de l'adversaire]\n");
    Duel d(0, 0, 0, 0);
    d.run(200);
    d.sb->leave();
    d.run(3);
    CHECK(d.sa->state() == NS_FAILED && d.sa->error() == NE_PEER_LEFT);
    CHECK(d.sb->state() == NS_CLOSED);
}

static void test_desync() {
    std::printf("[desynchronisation detectee]\n");
    Duel d(0, 0, 0, 0);
    d.run(200);
    d.pb.m.f[0].hp -= 1;                               // un seul PV d'ecart
    d.run(200);
    CHECK(d.sa->state() == NS_FAILED && d.sa->error() == NE_DESYNC);
    CHECK(d.sb->state() == NS_FAILED && d.sb->error() == NE_DESYNC);
}

static void test_version_and_noise() {
    std::printf("[version, bruit]\n");
    Duel d(0, 0, 0, 0);
    // Du bruit et des paquets inconnus ne perturbent rien.
    const uint8_t junk[] = { 1, 2, 3 }; const uint8_t shorty[] = { 0x49 };
    for (int i = 0; i < 20; ++i) { d.la.send(junk, 3); d.lb.send(shorty, 1); }
    d.run(100);
    CHECK(d.sa->state() == NS_RUNNING && d.sb->state() == NS_RUNNING);

    // Hote contacte par une version inconnue.
    Wire x, y; uint32_t clk = 1; Rng r{5};
    SimLink h; h.out = &x; h.in = &y; h.clock = &clk; h.rng = &r;
    Session host(h, true, KENJI, NetOptions{}, 7);
    const uint8_t hello[5] = { 0x49, 0x54, 1, 99, 2 };
    y.q.push_back({ std::vector<uint8_t>(hello, hello + 5), 0 });
    host.poll(10);
    CHECK(host.state() == NS_FAILED && host.error() == NE_VERSION);
}

static void test_connect_timeout() {
    std::printf("[connexion sans reponse]\n");
    Wire x, y; uint32_t clk = 1; Rng r{5};
    SimLink g; g.out = &x; g.in = &y; g.clock = &clk; g.rng = &r;
    Session guest(g, false, KENJI, NetOptions{}, 0);
    guest.poll(10);
    CHECK(guest.state() == NS_CONNECTING);
    CHECK(!x.q.empty());                               // il appelle (HELLO)
    guest.poll(130000);
    CHECK(guest.state() == NS_FAILED && guest.error() == NE_TIMEOUT);
}

// --- port serie : flux d'octets simule, avec corruption ---------------------------------------------
struct Pipe : ByteStream {
    std::deque<uint8_t> q; Rng* rng; float flip = 0, drop = 0; size_t cap = 100000;
    int write(const uint8_t* d, size_t n) override {
        size_t w = 0;
        for (; w < n && q.size() < cap; ++w) {
            if (rng->f() < drop) continue;
            uint8_t b = d[w];
            if (rng->f() < flip) b ^= (uint8_t)(1u << (rng->next() % 8));
            q.push_back(b);
        }
        return (int)w;
    }
    int read(uint8_t* buf, size_t max) override {
        size_t n = 0;
        while (n < max && n < 7 && !q.empty()) { buf[n++] = q.front(); q.pop_front(); }   // petites lectures
        return (int)n;
    }
};

static void test_slip() {
    std::printf("[framage serie SLIP + CRC]\n");
    Rng r{31337};
    Pipe p; p.rng = &r;
    SlipTransport t(p);

    // Les octets speciaux (0xC0, 0xDB) traversent correctement.
    const uint8_t tricky[] = { 0xC0, 0xDB, 0xDC, 0xDD, 0x00, 0xC0, 0xC0, 0xDB };
    CHECK(t.send(tricky, sizeof tricky));
    uint8_t buf[MAX_PACKET + 8];
    int n = t.recv(buf, sizeof buf);
    CHECK(n == (int)sizeof tricky && std::memcmp(buf, tricky, sizeof tricky) == 0);
    CHECK(t.recv(buf, sizeof buf) == 0);

    // 500 messages aleatoires : sans bruit, tous arrivent intacts et dans l'ordre.
    std::vector<std::vector<uint8_t>> sent;
    for (int i = 0; i < 500; ++i) {
        std::vector<uint8_t> m((size_t)(1 + r.next() % MAX_PACKET));
        for (auto& b : m) b = (uint8_t)r.next();
        sent.push_back(m);
        CHECK(t.send(m.data(), m.size()));
        n = t.recv(buf, sizeof buf);
        CHECK(n == (int)m.size() && std::memcmp(buf, m.data(), m.size()) == 0);
    }

    // Avec bruit (0,5 % d'octets abimes, 0,2 % perdus) : jamais de message FAUX, certains arrivent.
    p.flip = 0.005f; p.drop = 0.002f;
    int ok = 0, bad = 0;
    std::set<std::string> everything;                  // un message livre doit TOUJOURS avoir ete emis tel quel
    for (int i = 0; i < 2000; ++i) {
        std::vector<uint8_t> m((size_t)(5 + r.next() % 40));
        for (auto& b : m) b = (uint8_t)r.next();
        everything.insert(std::string((const char*)m.data(), m.size()));
        t.send(m.data(), m.size());
        while ((n = t.recv(buf, sizeof buf)) > 0) {
            if (everything.count(std::string((const char*)buf, (size_t)n))) ++ok; else ++bad;
        }
    }
    CHECK(bad == 0);
    CHECK(ok > 700);

    // Trop long : refuse a l'emission.
    uint8_t big[MAX_PACKET + 1] = {};
    CHECK(!t.send(big, sizeof big));
}

static void test_session_over_serial() {
    std::printf("[session complete sur port serie bruite]\n");
    Rng r{2024};
    Pipe ab, ba; ab.rng = ba.rng = &r; ab.flip = ba.flip = 0.002f;
    SlipTransport ta(ba), tb(ab);                      // ta ecrit dans ab? -> on croise :
    // hote ecrit dans `ab`, lit `ba` ; invite l'inverse. SlipTransport lit et ecrit sur le MEME flux : on utilise 2 flux.
    struct Duplex : ByteStream {
        Pipe* rd; Pipe* wr;
        int read(uint8_t* b, size_t m) override { return rd->read(b, m); }
        int write(const uint8_t* d, size_t n) override { return wr->write(d, n); }
    } da, db;
    da.rd = &ba; da.wr = &ab; db.rd = &ab; db.wr = &ba;
    SlipTransport sa(da), sb(db);
    (void)ta; (void)tb;

    NetOptions o; o.input_delay = 3;
    Session A(sa, true, NYXIA, o, 5150), B(sb, false, MALAKOR, NetOptions{}, 0);
    Player pa, pb; pa.s = &A; pb.s = &B; pa.rng.s = 3; pb.rng.s = 4;
    uint32_t now = 1000;
    for (uint32_t i = 0; i < 2400; ++i) { now += 33; pa.frame(now, i); pb.frame(now, i); }
    CHECK(A.state() == NS_RUNNING && B.state() == NS_RUNNING);
    CHECK(A.sim_tick() > 1500);
    const size_t n = pa.hashes.size() < pb.hashes.size() ? pa.hashes.size() : pb.hashes.size();
    bool same = n > 0;
    for (size_t i = 0; i < n; ++i) if (pa.hashes[i] != pb.hashes[i]) same = false;
    CHECK(same);
}

int main() {
    test_basics();
    test_clean_link();
    test_lossy_link();
    test_dead_link();
    test_peer_leaves();
    test_desync();
    test_version_and_noise();
    test_connect_timeout();
    test_slip();
    test_session_over_serial();
    std::printf("\n%d verifications, %d echec(s)\n", g_checks, g_fail);
    return g_fail ? 1 : 0;
}
