/*
===============================================================================
  pc_main.cpp — Iron Tournament, version PC (SDL2)
-------------------------------------------------------------------------------
  Meme jeu que la console : moteur, vue et coquille sont compiles tels quels. Cette
  version ne fournit que la fenetre, le clavier/la manette, le son et la boucle a 30 fps.

  Options :   --scale 1|2|3     taille de la fenetre (x1 = 320x240) ; defaut = reglage sauvegarde
              --fullscreen      plein ecran
              --data DIR        dossier du jeu (config.dat, captures, sprites/)
  Le zoom se change aussi dans Options, et F11 bascule en plein ecran.
===============================================================================
*/
#include <SDL.h>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <sys/stat.h>
#include "pc_platform.h"
#include "../main/shell/shell.h"
#include "../main/shell/save.h"
#include "../main/core/graphics.h"
#include "../main/core/input.h"
#include "../main/core/audio.h"
#include "../main/tasks/task_system.h"
#include "../main/games/fight/fight_sprites.h"

static SDL_Window*   g_win = nullptr;
static SDL_Renderer* g_ren = nullptr;
static SDL_Texture*  g_tex = nullptr;
static bool g_quit = false;
static int  g_windowed_zoom = 2;
static bool g_fullscreen = false;
static SDL_GameController* g_pad = nullptr;

void pc_request_quit()    { g_quit = true; }
bool pc_quit_requested()  { return g_quit; }
namespace tasks { void return_to_loader() { g_quit = true; } }    // « retour au loader » = quitter

void pc_apply_zoom(int z) {
    if (!g_win) return;
    if (z >= 4) {
        SDL_SetWindowFullscreen(g_win, SDL_WINDOW_FULLSCREEN_DESKTOP);
        g_fullscreen = true;
    } else {
        SDL_SetWindowFullscreen(g_win, 0);
        SDL_SetWindowSize(g_win, 320 * z, 240 * z);
        SDL_SetWindowPosition(g_win, SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED);
        g_windowed_zoom = z;
        g_fullscreen = false;
    }
}

void pc_present(const uint16_t* fb) {
    SDL_UpdateTexture(g_tex, nullptr, fb, 320 * 2);
    SDL_RenderClear(g_ren);
    SDL_RenderCopy(g_ren, g_tex, nullptr, nullptr);
    SDL_RenderPresent(g_ren);
}

// --- entrees ----------------------------------------------------------------------------------------------
static void read_inputs(bool* held) {
    using core::Button;
    for (int i = 0; i < (int)Button::COUNT; ++i) held[i] = false;
    const Uint8* k = SDL_GetKeyboardState(nullptr);
    auto any = [&](std::initializer_list<SDL_Scancode> l) { for (auto s : l) if (k[s]) return true; return false; };

    held[(int)Button::Left]  = any({SDL_SCANCODE_LEFT,  SDL_SCANCODE_A});
    held[(int)Button::Right] = any({SDL_SCANCODE_RIGHT, SDL_SCANCODE_D});
    held[(int)Button::Up]    = any({SDL_SCANCODE_UP,    SDL_SCANCODE_W});
    held[(int)Button::Down]  = any({SDL_SCANCODE_DOWN,  SDL_SCANCODE_S});
    held[(int)Button::A]     = any({SDL_SCANCODE_J, SDL_SCANCODE_RETURN, SDL_SCANCODE_KP_ENTER, SDL_SCANCODE_SPACE});
    held[(int)Button::B]     = any({SDL_SCANCODE_K, SDL_SCANCODE_BACKSPACE});
    held[(int)Button::C]     = any({SDL_SCANCODE_L});
    held[(int)Button::D]     = any({SDL_SCANCODE_U});
    held[(int)Button::Menu]  = any({SDL_SCANCODE_ESCAPE});

    if (g_pad) {
        auto b = [&](SDL_GameControllerButton x) { return SDL_GameControllerGetButton(g_pad, x) != 0; };
        const int ax = SDL_GameControllerGetAxis(g_pad, SDL_CONTROLLER_AXIS_LEFTX);
        const int ay = SDL_GameControllerGetAxis(g_pad, SDL_CONTROLLER_AXIS_LEFTY);
        held[(int)Button::Left]  |= b(SDL_CONTROLLER_BUTTON_DPAD_LEFT)  || ax < -16000;
        held[(int)Button::Right] |= b(SDL_CONTROLLER_BUTTON_DPAD_RIGHT) || ax >  16000;
        held[(int)Button::Up]    |= b(SDL_CONTROLLER_BUTTON_DPAD_UP)    || ay < -16000;
        held[(int)Button::Down]  |= b(SDL_CONTROLLER_BUTTON_DPAD_DOWN)  || ay >  16000;
        held[(int)Button::A]     |= b(SDL_CONTROLLER_BUTTON_A);
        held[(int)Button::B]     |= b(SDL_CONTROLLER_BUTTON_B);
        held[(int)Button::C]     |= b(SDL_CONTROLLER_BUTTON_X);
        held[(int)Button::D]     |= b(SDL_CONTROLLER_BUTTON_Y);
        held[(int)Button::L1]    |= b(SDL_CONTROLLER_BUTTON_LEFTSHOULDER);
        held[(int)Button::R1]    |= b(SDL_CONTROLLER_BUTTON_RIGHTSHOULDER);
        held[(int)Button::Menu]  |= b(SDL_CONTROLLER_BUTTON_START);
    }
}

static void open_first_pad() {
    if (g_pad) return;
    for (int i = 0; i < SDL_NumJoysticks(); ++i)
        if (SDL_IsGameController(i)) { g_pad = SDL_GameControllerOpen(i); if (g_pad) break; }
}

// --- mode de test scripte (CI / verification) : --autotest -----------------------------------------------
// Rejoue des appuis de touches a des images precises et enregistre des captures dans le dossier --data.
struct ScriptedPress { int from, to; core::Button b; };
static const ScriptedPress AUTOTEST[] = {
    {10, 12, core::Button::A},                                   // titre -> menu
    {20, 22, core::Button::A},                                   // Tournoi -> choix du combattant
    {26, 27, core::Button::Right}, {32, 34, core::Button::A},    // Krowen -> Versus
    {50, 52, core::Button::A},                                   // lance le combat (charge les sprites)
    {110, 150, core::Button::Right}, {152, 154, core::Button::A},
    {170, 172, core::Button::B}, {180, 182, core::Button::C},
    {200, 215, core::Button::Left},  {216, 218, core::Button::A}, {230, 232, core::Button::B},
};
static const int AUTOTEST_SHOTS[] = { 5, 15, 25, 40, 100, 153, 172, 183, 218 };
static const int AUTOTEST_END = 260;

static bool dir_exists(const std::string& p) { struct stat st; return stat(p.c_str(), &st) == 0; }

int main(int argc, char** argv) {
    int cli_zoom = 0;
    bool autotest = false;
    std::string data_dir;
    for (int i = 1; i < argc; ++i) {
        if (!std::strcmp(argv[i], "--scale") && i + 1 < argc) cli_zoom = std::atoi(argv[++i]);
        else if (!std::strcmp(argv[i], "--fullscreen")) cli_zoom = 4;
        else if (!std::strcmp(argv[i], "--data") && i + 1 < argc) data_dir = argv[++i];
        else if (!std::strcmp(argv[i], "--autotest")) autotest = true;
        else {
            std::printf("Iron Tournament (PC)\nUsage : %s [--scale 1|2|3] [--fullscreen] [--data DOSSIER]\n", argv[0]);
            return std::strcmp(argv[i], "--help") == 0 ? 0 : 1;
        }
    }
    if (cli_zoom < 0 || cli_zoom > 4) cli_zoom = 2;

    // Dossier du jeu : meme contenu que le dossier IRONTOURNAMENT de la carte SD.
    if (data_dir.empty()) {
        char* base = SDL_GetBasePath();
        const std::string b = base ? base : "./";
        if (base) SDL_free(base);
        if (dir_exists(b + "IRONTOURNAMENT")) data_dir = b + "IRONTOURNAMENT";
        else if (dir_exists("sd/IRONTOURNAMENT")) data_dir = "sd/IRONTOURNAMENT";   // lance depuis la racine du depot
        else data_dir = b + "IRONTOURNAMENT";
    }
#ifdef _WIN32
    _mkdir(data_dir.c_str());
#else
    mkdir(data_dir.c_str(), 0777);
#endif
    pc_set_data_dir(data_dir.c_str());
    save::set_dir(data_dir.c_str());
    fight::spr::set_dir((data_dir + "/sprites").c_str());

    if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_GAMECONTROLLER) != 0) {
        std::fprintf(stderr, "SDL_Init : %s\n", SDL_GetError());
        return 1;
    }
    SDL_SetHint(SDL_HINT_RENDER_SCALE_QUALITY, "0");           // pixels nets
    g_win = SDL_CreateWindow("Iron Tournament", SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED,
                             640, 480, SDL_WINDOW_SHOWN);
    g_ren = g_win ? SDL_CreateRenderer(g_win, -1, SDL_RENDERER_ACCELERATED | SDL_RENDERER_PRESENTVSYNC) : nullptr;
    if (g_win && !g_ren) g_ren = SDL_CreateRenderer(g_win, -1, SDL_RENDERER_SOFTWARE);
    if (!g_ren) { std::fprintf(stderr, "Fenetre/rendu : %s\n", SDL_GetError()); return 1; }
    SDL_RenderSetLogicalSize(g_ren, 320, 240);
    g_tex = SDL_CreateTexture(g_ren, SDL_PIXELFORMAT_BGR565, SDL_TEXTUREACCESS_STREAMING, 320, 240);
    if (!g_tex) { std::fprintf(stderr, "Texture : %s\n", SDL_GetError()); return 1; }
    open_first_pad();

    pc_audio_open();
    core::graphics_init();
    core::audio_init();
    shell::init();                                   // lit config.dat et applique le zoom sauvegarde
    if (cli_zoom) core::graphics_set_zoom(cli_zoom);

    const Uint64 freq = SDL_GetPerformanceFrequency();
    Uint64 next = SDL_GetPerformanceCounter();
    bool held[(int)core::Button::COUNT];

    while (!g_quit) {
        SDL_Event e;
        while (SDL_PollEvent(&e)) {
            if (e.type == SDL_QUIT) g_quit = true;
            else if (e.type == SDL_CONTROLLERDEVICEADDED) open_first_pad();
            else if (e.type == SDL_CONTROLLERDEVICEREMOVED && g_pad) { SDL_GameControllerClose(g_pad); g_pad = nullptr; open_first_pad(); }
            else if (e.type == SDL_KEYDOWN && e.key.keysym.scancode == SDL_SCANCODE_F11 && !e.key.repeat)
                pc_apply_zoom(g_fullscreen ? g_windowed_zoom : 4);
        }

        const uint32_t now = SDL_GetTicks();
        read_inputs(held);
        if (autotest) {
            static int frame = 0;
            for (int i = 0; i < (int)core::Button::COUNT; ++i) held[i] = false;
            for (const ScriptedPress& p : AUTOTEST) if (frame >= p.from && frame <= p.to) held[(int)p.b] = true;
            for (int sh : AUTOTEST_SHOTS) if (frame == sh) core::graphics_save_screenshot_bmp();
            if (++frame >= AUTOTEST_END) g_quit = true;
        }
        core::pc_input_feed(held);
        core::input_poll(now);
        shell::update(now);
        shell::draw();
        core::graphics_present();

        next += freq / 30;                           // 30 images par seconde, comme la console
        const Uint64 t = SDL_GetPerformanceCounter();
        if (next > t) SDL_Delay((Uint32)((next - t) * 1000 / freq));
        else next = t;
    }

    save::Config c;                                  // les reglages sont deja sauvegardes par la coquille
    (void)c;
    pc_audio_close();
    fight::spr::release_all();
    if (g_pad) SDL_GameControllerClose(g_pad);
    SDL_DestroyTexture(g_tex); SDL_DestroyRenderer(g_ren); SDL_DestroyWindow(g_win);
    SDL_Quit();
    return 0;
}
