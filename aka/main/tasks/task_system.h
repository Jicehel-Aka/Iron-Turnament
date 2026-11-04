#pragma once
namespace tasks {

void task_system(void* param);

// Redemarre sur la partition du loader. Appelable depuis n'importe quelle tache :
// c'est un esp_restart(), il n'y a rien a synchroniser.
void return_to_loader();

}
