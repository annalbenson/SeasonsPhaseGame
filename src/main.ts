import Phaser from 'phaser';
import TitleScene from './scenes/TitleScene';
import GameScene  from './scenes/GameScene';
import QuoteScene from './scenes/QuoteScene';
import EndScene   from './scenes/EndScene';
import UIScene       from './scenes/UIScene';
import TutorialScene from './scenes/TutorialScene';
import { TILE, COLS, ROWS, HEADER, PANEL } from './constants';

new Phaser.Game({
    type:            Phaser.AUTO,
    width:           COLS * TILE + PANEL,
    height:          ROWS * TILE + HEADER,
    backgroundColor: '#060c14',
    scene:           [TitleScene, GameScene, QuoteScene, EndScene, UIScene, TutorialScene],
    scale: {
        mode:       Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
});
