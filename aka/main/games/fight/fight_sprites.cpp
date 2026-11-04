#include "fight_sprites.h"
#include <cstdio>
#include <cstdlib>
#include <cstring>

#ifdef ESP_PLATFORM
#include "esp_heap_caps.h"
static void* big_alloc(size_t n) { return heap_caps_malloc(n, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT); }
static void  big_free(void* p)   { heap_caps_free(p); }
#define SPR_DIR "/sdcard/IRONTOURNAMENT/sprites"
#else
static void* big_alloc(size_t n) { return std::malloc(n); }
static void  big_free(void* p)   { std::free(p); }
#ifndef SPR_DIR
#define SPR_DIR "sd/IRONTOURNAMENT/sprites"
#endif
#endif

namespace fight { namespace spr {

static const char* const NAMES[FIGHTER_COUNT] = { "KENJI", "KROWEN", "MEILIN", "TITAN", "NYXIA", "MALAKOR" };

struct Slot {
    int      id  = -1;          // FighterId charge, -1 = libre
    uint8_t* buf = nullptr;
    size_t   size = 0;
};
static Slot s_slot[2];
static char s_dir[256] = SPR_DIR;
void set_dir(const char* dir) { std::snprintf(s_dir, sizeof s_dir, "%s", dir); }

static void release(Slot& s) {
    if (s.buf) big_free(s.buf);
    s = Slot{};
}

static bool load_file(Slot& s, FighterId id) {
    char path[300];
    std::snprintf(path, sizeof path, "%s/%s.spr", s_dir, NAMES[id]);
    FILE* f = std::fopen(path, "rb");
    if (!f) return false;
    std::fseek(f, 0, SEEK_END);
    const long n = std::ftell(f);
    std::fseek(f, 0, SEEK_SET);
    if (n < 12 + 12 * ROWS * COLS) { std::fclose(f); return false; }

    uint8_t* buf = (uint8_t*)big_alloc((size_t)n);
    if (!buf) { std::fclose(f); return false; }
    const size_t got = std::fread(buf, 1, (size_t)n, f);
    std::fclose(f);

    uint16_t ver, count, cols;
    std::memcpy(&ver, buf + 4, 2); std::memcpy(&count, buf + 6, 2); std::memcpy(&cols, buf + 8, 2);
    if (got != (size_t)n || std::memcmp(buf, "ISPR", 4) != 0 || ver != 1 ||
        count != ROWS * COLS || cols != COLS) {
        big_free(buf);
        return false;
    }
    s.id = id; s.buf = buf; s.size = (size_t)n;
    return true;
}

bool load_pair(FighterId a, FighterId b) {
    // Libere ce dont on n'a plus besoin.
    for (Slot& s : s_slot)
        if (s.id != a && s.id != b) release(s);

    bool ok = true;
    const FighterId want[2] = { a, b };
    for (FighterId w : want) {
        if (ready(w)) continue;
        Slot* free_slot = (s_slot[0].id < 0) ? &s_slot[0] : (s_slot[1].id < 0 ? &s_slot[1] : nullptr);
        if (!free_slot || !load_file(*free_slot, w)) ok = false;
    }
    return ok;
}

bool ready(FighterId id) {
    return s_slot[0].id == id || s_slot[1].id == id;
}

bool frame(FighterId id, int row, int col, Frame& out) {
    const Slot* s = s_slot[0].id == id ? &s_slot[0] : (s_slot[1].id == id ? &s_slot[1] : nullptr);
    if (!s || row < 0 || row >= ROWS || col < 0 || col >= COLS) return false;

    const uint8_t* e = s->buf + 12 + 12 * (row * COLS + col);
    uint32_t off;
    std::memcpy(&out.w, e, 2);  std::memcpy(&out.h, e + 2, 2);
    std::memcpy(&out.ox, e + 4, 2); std::memcpy(&out.oy, e + 6, 2);
    std::memcpy(&off, e + 8, 4);
    if (out.w == 0 || out.h == 0) { out.px = nullptr; return true; }
    if ((size_t)off + (size_t)out.w * out.h * 2 > s->size) return false;
    out.px = (const uint16_t*)(s->buf + off);       // 2 octets alignes : offsets pairs
    return true;
}

void release_all() { for (Slot& s : s_slot) release(s); }

}} // namespace fight::spr
