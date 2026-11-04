#include "save.h"
#include <stdio.h>
#include <sys/stat.h>
namespace save {
static char s_dir[256] = "/sdcard/IRONTOURNAMENT";

void set_dir(const char* dir) { snprintf(s_dir, sizeof s_dir, "%s", dir); }
static void cfg_path(char* out, size_t n) { snprintf(out, n, "%s/config.dat", s_dir); }

constexpr uint32_t MAGIC = 0x4952544Eu;   // "IRTN"

struct File { uint32_t magic; Config cfg; };

static bool ensure_dir() {
    struct stat st;
    if (stat(s_dir, &st) == 0) return true;
#ifdef _WIN32
    if (mkdir(s_dir) == 0) return true;
#else
    if (mkdir(s_dir, 0777) == 0) return true;
#endif
    return stat(s_dir, &st) == 0;
}

bool save(const Config& c) {
    if (!ensure_dir()) return false;
    char kCfg[300]; cfg_path(kCfg, sizeof kCfg);
    FILE* f = fopen(kCfg, "wb");
    if (!f) return false;
    File d { MAGIC, c };
    const bool ok = fwrite(&d, sizeof d, 1, f) == 1;
    fclose(f);
    return ok;
}

bool load(Config& c) {
    char kCfg[300]; cfg_path(kCfg, sizeof kCfg);
    FILE* f = fopen(kCfg, "rb");
    if (!f) return false;
    File d {};
    const bool ok = fread(&d, sizeof d, 1, f) == 1;
    fclose(f);
    if (!ok || d.magic != MAGIC) return false;
    c = d.cfg;
    return true;
}
}
