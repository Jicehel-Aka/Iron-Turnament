/*
  pc_assets.cpp — Embarque title.bin, portraits.bin et stages.bin (les memes fichiers que la
  console) dans l'executable, sous les MEMES noms de symboles que ceux de l'ESP-IDF
  (EMBED_FILES) : la coquille et la vue n'ont donc rien a changer.
  Necessite GCC ou Clang sous Linux / MinGW (directive .incbin).
*/
#ifndef IRON_ASSET_DIR
#error "IRON_ASSET_DIR doit pointer vers main/assets (cf. pc/CMakeLists.txt)"
#endif

#ifdef _WIN32
#define IRON_SEC_BEGIN ".section .rdata,\"dr\"\n"
#define IRON_SEC_END   ".text\n"
#else
#define IRON_SEC_BEGIN ".pushsection .rodata\n"
#define IRON_SEC_END   ".popsection\n"
#endif

asm(IRON_SEC_BEGIN
    ".balign 4\n"
    ".global _binary_title_bin_start\n_binary_title_bin_start:\n"
    ".incbin \"" IRON_ASSET_DIR "/title.bin\"\n"
    ".balign 4\n"
    ".global _binary_portraits_bin_start\n_binary_portraits_bin_start:\n"
    ".incbin \"" IRON_ASSET_DIR "/portraits.bin\"\n"
    ".balign 4\n"
    ".global _binary_stages_bin_start\n_binary_stages_bin_start:\n"
    ".incbin \"" IRON_ASSET_DIR "/stages.bin\"\n"
    IRON_SEC_END);
