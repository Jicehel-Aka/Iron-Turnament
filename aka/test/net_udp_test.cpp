/*
  net_udp_test.cpp — Combat reseau REEL sur la boucle locale : l'hote et l'invite sont deux sockets UDP
  et deux combats, comme sur deux machines. Verifie aussi la decouverte par adresse explicite.

      g++ -std=c++17 -O2 -Wall -Wextra -Werror -ffp-contract=off -I main/games/fight -I main/net test/net_udp_test.cpp \
          main/games/fight/fight_data.cpp main/games/fight/fight_engine.cpp main/games/fight/fight_ai.cpp \
          main/games/fight/netplay.cpp main/net/net_udp.cpp -o net_udp_test && ./net_udp_test
*/
#include "netplay.h"
#include "net_udp.h"
#include <chrono>
#include <cstdio>
#include <string>
#include <thread>
#include <vector>

using namespace fight;
using namespace fight::net;

static int g_fail = 0, g_checks = 0;
#define CHECK(c) do { ++g_checks; if (!(c)) { ++g_fail; std::printf("  ECHEC ligne %d : %s\n", __LINE__, #c); } } while (0)

struct Side {
    netlink::UdpTransport t; Session* s = nullptr; Match m; bool inited = false; uint32_t rs = 1; Input prev;
    std::vector<uint32_t> hashes;
    Input rnd_input() {
        rs ^= rs << 13; rs ^= rs >> 17; rs ^= rs << 5;
        Input in = prev;
        if (rs % 4 == 0) { in.left = rs & 8; in.right = rs & 16; in.up = (rs & 96) == 0; in.down = (rs & 384) == 0;
                           in.a = (rs & 1536) == 0; in.b = (rs & 6144) == 0; in.special = (rs & 24576) == 0; }
        in.jp_a = in.a && !prev.a; in.jp_b = in.b && !prev.b; in.jp_special = in.special && !prev.special;
        prev = in; return in;
    }
    void frame(uint32_t now) {
        s->poll(now);
        if (s->state() != NS_RUNNING) return;
        if (!inited) { MatchRules r; r.rounds_to_win = s->options().rounds_to_win; r.round_sec = s->options().round_sec;
                       init_match(m, (FighterId)s->p1_fighter(), (FighterId)s->p2_fighter(), false, s->seed(), r); inited = true; }
        Input a, b;
        if (!s->tick(rnd_input(), a, b)) return;
        for (int k = 0; k < 2; ++k) {
            Input x = a, y = b;
            if (k) { x.jp_a = x.jp_b = x.jp_special = false; y.jp_a = y.jp_b = y.jp_special = false; }
            step_match_2p(m, x, y); m.sfx = 0;
            if (m.phase == PH_ROUND_END && m.winner_slot && m.wins[0] < m.rounds_to_win && m.wins[1] < m.rounds_to_win) start_next_round(m);
        }
        s->on_simulated(m);
        if (s->sim_tick() % 30 == 0) hashes.push_back(hash_match(m));
    }
};

static void run(bool broadcast_like_ip, uint16_t port) {
    char err[80] = "";
    Side h, g; h.rs = 7; g.rs = 13;
    CHECK(h.t.open(true, nullptr, port, err, sizeof err));
    CHECK(g.t.open(false, broadcast_like_ip ? "127.0.0.1" : nullptr, port, err, sizeof err));   // nullptr = diffusion
    NetOptions o; o.rounds_to_win = 3; o.round_sec = 60;
    Session hs(h.t, true, MEILIN, o, 9001), gs(g.t, false, NYXIA, NetOptions{}, 0);
    h.s = &hs; g.s = &gs;

    uint32_t now = 100;
    for (int i = 0; i < 1500; ++i) {                   // 50 s de jeu, cadence acceleree
        now += 33; h.frame(now); g.frame(now);
        std::this_thread::sleep_for(std::chrono::microseconds(300));
    }
    CHECK(hs.state() == NS_RUNNING && gs.state() == NS_RUNNING);
    CHECK(gs.p1_fighter() == MEILIN && gs.p2_fighter() == NYXIA);
    CHECK(gs.options().rounds_to_win == 3 && gs.options().round_sec == 60);   // les regles de l'hote s'imposent
    CHECK(hs.sim_tick() > 1000 && gs.sim_tick() > 1000);
    const size_t n = h.hashes.size() < g.hashes.size() ? h.hashes.size() : g.hashes.size();
    bool same = n > 20;
    for (size_t i = 0; i < n; ++i) if (h.hashes[i] != g.hashes[i]) same = false;
    CHECK(same);
    if (broadcast_like_ip) CHECK(std::string(h.t.peer_text()) == "127.0.0.1");
    else CHECK(std::string(g.t.peer_text()) != "LAN");      // l'invite a appris l'adresse reelle de l'hote
    hs.leave();
    for (int i = 0; i < 5; ++i) { now += 33; g.frame(now); std::this_thread::sleep_for(std::chrono::milliseconds(2)); }
    CHECK(gs.state() == NS_FAILED && gs.error() == NE_PEER_LEFT);
}

int main() {
    std::printf("[UDP boucle locale]\n");
    run(true, 47771);
    std::printf("[UDP decouverte par diffusion]\n");
    run(false, 47772);
    std::printf("\n%d verifications, %d echec(s)\n", g_checks, g_fail);
    return g_fail ? 1 : 0;
}
