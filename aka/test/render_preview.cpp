/*
  render_preview.cpp — Apercu PC du rendu (aucun materiel) : simule l'ecran 320x240
  et ecrit des fichiers .ppm. Les textes sont remplaces par des blocs (pas de police).
  Compilation : voir test/run_preview.sh
*/
#include "fight.h"
#include "fight_view.h"
#include "fight_sprites.h"
#include "../../shell/ui.h"
#include "../../core/graphics.h"
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <algorithm>

asm(".section .rodata\n.global _binary_portraits_bin_start\n_binary_portraits_bin_start:\n.incbin \"main/assets/portraits.bin\"\n"
    ".global _binary_stages_bin_start\n_binary_stages_bin_start:\n.incbin \"main/assets/stages.bin\"\n.text\n");

static uint16_t FB[240][320];
namespace ui { uint16_t C_BG=0x2000,C_BAR=0x1000,C_TEXT=0xFFFF,C_DIM=0x8410,C_ACCENT=0x07FF,C_BOARD,C_BOARD_ALT,C_GRID,C_P1,C_P2,C_P1_DARK,C_P2_DARK,C_CURSOR=0x07E0,C_TARGET,C_LAST,C_MENU_BG,C_MENU_SEL; }

namespace core {
uint16_t graphics_make_color(int r,int g,int b){ r=std::clamp(r,0,255);g=std::clamp(g,0,255);b=std::clamp(b,0,255);
    return (uint16_t)(((b>>3)<<11)|((g>>2)<<5)|(r>>3)); }
static void px(int x,int y,uint16_t c){ if(x>=0&&x<320&&y>=0&&y<240) FB[y][x]=c; }
void graphics_fill_rect_raw(int x,int y,int w,int h,uint16_t c){ for(int j=0;j<h;j++)for(int i=0;i<w;i++)px(x+i,y+j,c); }
void graphics_draw_rect_raw(int x,int y,int w,int h,uint16_t c){ for(int i=0;i<w;i++){px(x+i,y,c);px(x+i,y+h-1,c);} for(int j=0;j<h;j++){px(x,y+j,c);px(x+w-1,y+j,c);} }
void graphics_fill_circle_raw(int cx,int cy,int r,uint16_t c){ for(int j=-r;j<=r;j++)for(int i=-r;i<=r;i++) if(i*i+j*j<=r*r+r/2) px(cx+i,cy+j,c); }
void graphics_fill_triangle_raw(int x0,int y0,int x1,int y1,int x2,int y2,uint16_t c){
    int minx=std::min({x0,x1,x2}),maxx=std::max({x0,x1,x2}),miny=std::min({y0,y1,y2}),maxy=std::max({y0,y1,y2});
    auto e=[](int ax,int ay,int bx,int by,int cx,int cy){return (bx-ax)*(cy-ay)-(by-ay)*(cx-ax);};
    for(int y=miny;y<=maxy;y++)for(int x=minx;x<=maxx;x++){int a=e(x0,y0,x1,y1,x,y),b=e(x1,y1,x2,y2,x,y),d=e(x2,y2,x0,y0,x,y);
        if((a>=0&&b>=0&&d>=0)||(a<=0&&b<=0&&d<=0)) px(x,y,c);} }
void graphics_draw_text_raw(int x,int y,const char* t,uint16_t c){ for(;*t;++t,x+=8){ if(*t!=' ') graphics_fill_rect_raw(x+1,y+1,5,6,c);} }
int  graphics_text_width(const char* t){ int n=0; for(;*t;++t) if(((unsigned char)*t&0xC0)!=0x80) n++; return n*8; }
void graphics_draw_text_center_raw(int y,const char* t,uint16_t c){ graphics_draw_text_raw((320-graphics_text_width(t))/2,y,t,c); }
void graphics_draw_bitmap565(int x,int y,int w,int h,const uint16_t* d,bool tr,uint16_t key){ for(int j=0;j<h;j++)for(int i=0;i<w;i++){ uint16_t v=d[j*w+i]; if(tr&&v==key) continue; px(x+i,y+j,v);} }
void graphics_draw_bitmap565_scaled(int x,int y,int dw,int dh,const uint16_t* d,int sw,int sh,bool,uint16_t){
    for(int j=0;j<dh;j++)for(int i=0;i<dw;i++) px(x+i,y+j,d[(j*sh/dh)*sw+(i*sw/dw)]); }
}
// sons : neant
namespace core {
void sfx_cursor(){} void sfx_select(){} void sfx_cancel(){} void sfx_move(){} void sfx_capture(){} void sfx_multi_capture(){}
void sfx_promote(){} void sfx_gameover(){} void sfx_draw(){} void sfx_illegal(){} void sfx_menu_ok(){} void sfx_menu_back(){}
}
using namespace fight; using namespace core;
static void dump(const char* path){
    FILE* f=fopen(path,"wb"); fprintf(f,"P6\n320 240\n255\n");
    for(int y=0;y<240;y++)for(int x=0;x<320;x++){ uint16_t c=FB[y][x];
        unsigned char rgb[3]={(unsigned char)((c&31)<<3),(unsigned char)(((c>>5)&63)<<2),(unsigned char)(((c>>11)&31)<<3)}; fwrite(rgb,1,3,f);} fclose(f); }
int main(int argc,char**argv){
    const char* dir = argc>1?argv[1]:".";
    struct Shot{ FighterId a,b; Action aa,ab; int fa,fb; const char* name; };
    const Shot shots[] = {
        {KENJI,KROWEN,A_IDLE,A_IDLE,0,0,"s0"},
        {KENJI,KROWEN,A_HEAVY,A_HITSTUN,9,3,"s1"},
        {MEILIN,TITAN,A_SPECIAL_1,A_BLOCK_HIGH,8,0,"s2"},
        {NYXIA,MALAKOR,A_UPPERCUT,A_KNOCKDOWN,6,20,"s3"},
        {TITAN,MEILIN,A_LIGHT,A_JUMP,4,0,"s4"},
        {MALAKOR,KENJI,A_IDLE,A_DIZZY,0,0,"s5"},
    };
    for(const Shot& s: shots){
        spr::load_pair(s.a,s.b);
        Match m; init_match(m,s.a,s.b,false,7);
        m.phase=PH_FIGHT; m.banner=BN_NONE; m.frame=40;
        m.f[0].x=270; m.f[1].x=330;
        if(s.aa==A_LIGHT||s.aa==A_HEAVY||s.aa==A_UPPERCUT){ m.f[0].x=290; m.f[1].x=335; }
        m.f[0].action=s.aa; m.f[0].action_frame=s.fa; m.f[0].action_total=24;
        m.f[1].action=s.ab; m.f[1].action_frame=s.fb; m.f[1].action_total=40;
        if(s.ab==A_JUMP) m.f[1].y=-40;
        m.f[1].hp=m.f[1].max_hp*7/10; m.wins[0]=1;
        graphics_fill_rect_raw(0,0,320,240,0);
        draw_match(m,0);
        char path[256]; snprintf(path,sizeof path,"%s/%s.ppm",dir,s.name); dump(path);
    }
    // ecran de selection
    graphics_fill_rect_raw(0,0,320,240,0); draw_select(TITAN,1000,"CHOIX"); char path[256]; snprintf(path,sizeof path,"%s/sel.ppm",dir); dump(path);
    // bandeau
    { Match m; init_match(m,KENJI,KROWEN,false,3); m.phase=PH_FIGHT; m.banner=BN_FINISH_HIM; m.banner_arg=KENJI; m.banner_timer=100; m.f[1].action=A_DIZZY;
      graphics_fill_rect_raw(0,0,320,240,0); draw_match(m,0); snprintf(path,sizeof path,"%s/ban.ppm",dir); dump(path); }
    return 0;
}
