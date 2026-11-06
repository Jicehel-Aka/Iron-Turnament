/*
===============================================================================
  netplay.h — Mode 2 joueurs en reseau (cable USB ou Wi-Fi), moteur non modifie
-------------------------------------------------------------------------------
  PRINCIPE : « lockstep ». Les deux machines font tourner le MEME combat, le meme
  moteur, avec la meme graine ; seules les ENTREES des joueurs voyagent (2 octets
  par image de 30 fps). Un hote (P1) et un invite (P2).

    - Delai d'entree (3 images = 100 ms par defaut) : l'entree lue a l'image t
      s'applique a l'image t + delai, ce qui laisse le temps au paquet d'arriver.
    - Chaque paquet repete les entrees non acquittees (jusqu'a 16) : une perte de
      paquet ne bloque rien tant que le suivant arrive.
    - Si l'entree distante manque, la partie ATTEND (« stall ») ; au bout de
      `timeout_ms` sans aucun paquet, la liaison est declaree perdue.
    - Toutes les 30 images, chaque cote publie un condense (hash) de l'etat du
      combat ; un ecart (desynchronisation) arrete la partie proprement.

  Le fichier est PORTABLE (aucune dependance console ni SDL) : la couche de
  transport est une interface ; les implementations (UDP, port serie USB) sont
  dans main/net et pc/.

  DETERMINISME : le moteur n'utilise que + - * / et des comparaisons en virgule
  flottante simple precision (sin/cos ne servent qu'aux particules, exclues du
  condense). Compiler le moteur avec -ffp-contract=off sur toutes les cibles.
===============================================================================
*/
#pragma once
#include "fight.h"
#include <cstddef>
#include <cstdint>

namespace fight { namespace net {

constexpr uint8_t  PROTO_VERSION = 1;
constexpr uint16_t DEFAULT_PORT  = 7777;
constexpr int      MAX_PACKET    = 96;

// ---------------------------------------------------------------------------
// Transport : des MESSAGES (un paquet = un message), au mieux (perte possible).
// ---------------------------------------------------------------------------
class Transport {
public:
    virtual ~Transport() {}
    virtual bool send(const uint8_t* data, size_t n) = 0;
    virtual int  recv(uint8_t* buf, size_t max) = 0;      // 0 = rien a lire ; > 0 = longueur du message
    virtual bool alive() { return true; }                  // false : liaison definitivement coupee
};

// Flux d'octets (port serie) : lecture/ecriture NON bloquantes.
class ByteStream {
public:
    virtual ~ByteStream() {}
    virtual int read(uint8_t* buf, size_t max) = 0;        // 0 = rien
    virtual int write(const uint8_t* data, size_t n) = 0; // octets ecrits (< n si le tampon est plein)
    virtual bool alive() { return true; }
};

// Message sur flux d'octets : delimiteurs SLIP (0xC0) + CRC-16/CCITT ; une trame abimee est ignoree.
class SlipTransport : public Transport {
public:
    explicit SlipTransport(ByteStream& s) : s_(s) {}
    bool send(const uint8_t* data, size_t n) override;
    int  recv(uint8_t* buf, size_t max) override;
    bool alive() override { return s_.alive(); }
private:
    ByteStream& s_;
    uint8_t  in_[128];                      // octets lus pas encore interpretes
    int      in_pos_ = 0, in_len_ = 0;
    uint8_t  rx_[MAX_PACKET + 4];           // trame en cours (charge utile + CRC)
    size_t   rx_n_ = 0;
    bool     esc_ = false, overflow_ = false;
};

uint16_t crc16(const uint8_t* d, size_t n);

// ---------------------------------------------------------------------------
// Entrees et condense d'etat
// ---------------------------------------------------------------------------
uint16_t pack_input(const Input& in);
Input    unpack_input(uint16_t bits);
uint32_t hash_match(const Match& m);       // etat de JEU uniquement (pas les particules)

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------
struct NetOptions {
    uint8_t  rounds_to_win = 2;
    uint16_t round_sec     = 99;
    uint8_t  input_delay   = 3;            // 1..8 images
};

enum NetState : uint8_t { NS_CONNECTING, NS_RUNNING, NS_FAILED, NS_CLOSED };
enum NetError : uint8_t { NE_NONE, NE_TIMEOUT, NE_VERSION, NE_DESYNC, NE_PEER_LEFT, NE_LINK };

class Session {
public:
    // `host` : P1, choisit la graine et les regles. `my_fighter` : le combattant de CE joueur.
    Session(Transport& t, bool host, uint8_t my_fighter, const NetOptions& opt, uint32_t seed);

    // A appeler a chaque image (meme en attendant l'adversaire).
    void poll(uint32_t now_ms);

    NetState state() const { return state_; }
    NetError error() const { return err_; }
    bool     is_host() const { return host_; }

    // Valides quand state() == NS_RUNNING
    uint8_t    p1_fighter() const { return p1_; }
    uint8_t    p2_fighter() const { return p2_; }
    uint32_t   seed() const { return seed_; }
    NetOptions options() const { return opt_; }

    // Une image de 30 fps : donne l'entree locale ; renvoie true si l'image de JEU peut avancer
    // (p1/p2 = entrees a appliquer, avec jp_* valables pour le 1er pas seulement). false = on attend.
    bool tick(const Input& local, Input& p1, Input& p2);

    // A appeler apres CHAQUE image de jeu avancee : enregistre / compare les condenses.
    void on_simulated(const Match& m);

    void leave();                           // previent l'adversaire
    uint32_t sim_tick() const { return sim_; }
    uint32_t stalled_frames() const { return stall_; }
    uint32_t ms_since_rx(uint32_t now_ms) const { return now_ms - last_rx_ms_; }

private:
    enum { RING = 64, REDUNDANCY = 16, CK = 4 };
    void on_packet(const uint8_t* p, int n, uint32_t now_ms);
    void send_hello();
    void send_start();
    void send_inputs();
    void fail(NetError e);
    void send_bye(uint8_t reason);
    void check_checkpoints();

    Transport& t_;
    bool       host_;
    uint8_t    my_, p1_, p2_;
    uint32_t   seed_;
    NetOptions opt_;
    NetState   state_ = NS_CONNECTING;
    NetError   err_   = NE_NONE;

    uint32_t   now_ = 0, last_rx_ms_ = 0, last_hello_ms_ = 0, start_ms_ = 0;
    bool       hello_sent_ = false;

    uint16_t   local_in_[RING], remote_in_[RING];
    uint32_t   local_sent_ = 0;             // prochain tick local a emettre
    uint32_t   remote_next_ = 0;            // prochain tick distant attendu (= nombre de ticks recus d'affilee)
    uint32_t   peer_next_ = 0;              // le pair a recu nos ticks < peer_next_
    uint32_t   sim_ = 0;                    // prochain tick a simuler
    uint32_t   stall_ = 0;

    struct Ck { uint32_t tick, hash; };
    Ck         mine_[CK], theirs_[CK];
    Ck         last_mine_{0, 0};
};

}} // namespace fight::net
