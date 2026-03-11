import Phaser from 'phaser';
import TitleScene from './scenes/TitleScene';
import GameScene  from './scenes/GameScene';
import QuoteScene from './scenes/QuoteScene';
import UIScene    from './scenes/UIScene';
import { TILE, COLS, ROWS, HEADER } from './constants';

new Phaser.Game({
    type:            Phaser.AUTO,
    width:           COLS * TILE,
    height:          ROWS * TILE + HEADER,
    backgroundColor: '#060c14',
    scene:           [TitleScene, GameScene, QuoteScene, UIScene],
});
