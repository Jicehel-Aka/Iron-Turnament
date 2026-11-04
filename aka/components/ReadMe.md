2026/01/03/JMP - initial version
	! Nettoyage lib, réarrangement en composant ESP-IDF :
		drivers bas niveau dans le dossier gb_ll (a priori pas utilisé directement)
		librairies utilisateur dans le dossier gb_lib
	+ ajout gb_audio_track_wav : lecture depuis WAV sur sdcard, WAV en mémoiure ESP, ou raw en mémoire de l'ESP
		NOTE : #include "assets/WAV_SYSTEM.h" => embedded Gamebuino system sound : gb_wav_system_xxx
			eg : track_wav.play_wav( gb_wav_system_explode );
	+ ajout gb_audio_track_tone : génération d'un sine avec freq debut/fin et volume début/fin, et durée
	+ ajout gb_audio_track_fx : chainage de notes avecs volume/pitch sur base gb_audio_track_tone chainés 
	+ ajout gb_core : lecture touches, joystock, power off, tools divers
	+ ajout gb_audio_track_pmf : player de pmf : cf https://github.com/jeancharleslebeau-gif/pAKAman 
								pmf https://github.com/JarkkoPFC/arduino-music-player
								base de sons : modarchive.org
								tracker : https://milkytracker.org/
		sound MCU usage at :		22k		44k						
		track_wav(rom)				0.2%	0.4%
		track_fx/track_tone			0.25%	0.5%
		track_pmf(pacman.mod)		0.7%	1.5%		
		track_wav(sdcard)			6%		9%
	+ ajout core.buttons pressed, released..
    
2026/01/07/JMP 
	+ ajout core.joystick pour gestion joystick
	! la résolution du PWM du LCD passe à 10 bits => plage 0..1023
	+ ajout courbe de gamma pour backllignt 0 a 100 % => graphics.set_backlight_percent(60);
	+ ajout mesure FPS graphics.get_fps()

2026/01/20/JMP 
	+ Bugfix sweep du play_tone (calcul 64b)
	+ ajout garde fou sur player pour éviter de références 2 fois la même instance ( pmf, ou autre )
	! nombreux fix du player pmf : overflow des samples, ptr null..
	+ Ajout position() et length() player_track
	+ Implementation position() et length() track_pmf
	+ ajout exemple main_pmf_player ( lecture fichiers .pmf depuis carte SD)

