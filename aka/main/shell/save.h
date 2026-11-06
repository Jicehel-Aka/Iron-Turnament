#pragma once
#include <cstdint>
namespace save {
// Reglages d'Iron Tournament, ranges dans /sdcard/IRONTOURNAMENT/config.dat
// (noms longs acceptes : CONFIG_FATFS_LFN_HEAP).
struct Config {
    uint8_t level       {1};   // 0 Novice, 1 Arcade, 2 Maitre
    uint8_t language    {0};
    uint8_t fighter     {0};   // dernier combattant choisi
    uint8_t music_vol   {35};
    uint8_t sfx_vol     {85};
    uint8_t rounds      {2};   // manches a gagner : 1, 2 ou 3
    uint8_t time_idx    {2};   // duree d'une manche : 0 = 30 s, 1 = 60 s, 2 = 99 s, 3 = illimitee
    uint8_t zoom        {2};   // version PC : 1, 2, 3 ou 4 (= plein ecran) ; ignore sur la AKA
};
// Dossier du jeu (defaut : /sdcard/IRONTOURNAMENT ; la version PC passe le sien).
void set_dir(const char* dir);
bool load(Config& c);
bool save(const Config& c);
}
