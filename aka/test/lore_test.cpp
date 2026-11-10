// Textes de l'univers : tout tient a l'ecran (38 colonnes), rien n'est tronque, dans les 5 langues.
#include <cstdio>
#include <string>
#include "../main/shell/i18n.h"
#include "../main/shell/textwrap.h"

static int fails = 0, checks = 0;
#define CHECK(c) do { ++checks; if (!(c)) { ++fails; std::printf("  ECHEC ligne %d : %s\n", __LINE__, #c); } } while (0)

static std::string join(char (&b)[48][44], int n) {
    std::string s;
    for (int i = 0; i < n; ++i) { if (!s.empty() && b[i][0]) s += ' '; s += b[i]; }
    return s;
}
static int cols(const char* t) { int n = 0; for (; *t; ++t) if ((*t & 0xC0) != 0x80) ++n; return n; }

int main() {
    for (int L = 0; L < i18n::LANG_COUNT; ++L) {
        i18n::set_lang((i18n::Lang)L);
        for (int f = 0; f < 6; ++f) {
            for (int k = 0; k < 4; ++k) {                             // citations : 3 lignes au plus, rien de perdu
                const char* q = i18n::lore(f, k);
                CHECK(q[0]);
                char b[48][44]; const int n = textwrap::wrap<44>(q, 38, b, 0, 47);
                CHECK(n >= 1 && n <= 3);
                CHECK(join(b, n) == q);
                for (int i = 0; i < n; ++i) CHECK(cols(b[i]) <= 38);
            }
            CHECK(cols(i18n::lore(f, 4)) <= 38);                      // titre de la fin
            char b[48][44]; int n = 0;
            std::string all;
            for (int k = 5; k <= 7; ++k) {
                const int s0 = n;
                n = textwrap::wrap<44>(i18n::lore(f, k), 38, b, n, 47);
                std::string part; for (int i = s0; i < n; ++i) { if (!part.empty()) part += ' '; part += b[i]; }
                CHECK(part == i18n::lore(f, k));
                if (k < 7) b[n++][0] = 0;
            }
            CHECK(n <= 47);
            for (int i = 0; i < n; ++i) CHECK(cols(b[i]) <= 38);
        }
    }
    std::printf("%d verifications, %d echec(s)\n", checks, fails);
    return fails ? 1 : 0;
}
