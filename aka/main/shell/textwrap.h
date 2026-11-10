/*
  textwrap.h — coupe un texte UTF-8 en lignes de N colonnes (police 8x8 : un caractere = une colonne).
  Fonction pure, sans dependance : testee sur PC (test/lore_test.cpp).
*/
#pragma once
#include <cstdio>
#include <cstring>

namespace textwrap {

// Coupe `text` en lignes d'au plus `cols` colonnes (UTF-8 : un caractere = une colonne) ; ajoute a out[n..].
template <int W>
inline
int wrap(const char* text, int cols, char (&out)[][W], int n, int max_lines) {
    char line[W]; int len = 0, used = 0;                 // used = colonnes de la ligne en cours
    line[0] = 0;
    const char* p = text;
    while (*p && n < max_lines) {
        const char* e = p; int wc = 0;                   // un mot : jusqu'a l'espace suivant
        while (*e && *e != ' ') { if ((*e & 0xC0) != 0x80) ++wc; ++e; }
        const int wb = (int)(e - p);
        if (used > 0 && used + 1 + wc > cols) {          // ne tient pas : on termine la ligne
            snprintf(out[n++], W, "%s", line); line[0] = 0; len = 0; used = 0;
            if (n >= max_lines) break;
        }
        if (used > 0 && len + 1 < W) { line[len++] = ' '; ++used; }
        if (len + wb < W) { memcpy(line + len, p, (size_t)wb); len += wb; used += wc; line[len] = 0; }
        p = e; while (*p == ' ') ++p;
    }
    if (used > 0 && n < max_lines) snprintf(out[n++], W, "%s", line);
    return n;
}


} // namespace textwrap
