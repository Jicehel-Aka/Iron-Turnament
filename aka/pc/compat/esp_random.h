// Remplace esp_random() de l'ESP-IDF pour la version PC.
#pragma once
#include <cstdint>
#include <random>
static inline uint32_t esp_random() {
    static std::mt19937 rng{std::random_device{}()};
    return (uint32_t)rng();
}
