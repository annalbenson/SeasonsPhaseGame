import Phaser from 'phaser';
import TitleScene from './scenes/TitleScene';
import GameScene  from './scenes/GameScene';
import QuoteScene from './scenes/QuoteScene';
import EndScene   from './scenes/EndScene';
import UIScene       from './scenes/UIScene';
import TutorialScene from './scenes/TutorialScene';
import ToolkitScene  from './scenes/ToolkitScene';
import StatsScene    from './scenes/StatsScene';
import AuthScene     from './scenes/AuthScene';
import GameY2Scene      from './scenes/GameY2Scene';
import TutorialY2Scene from './scenes/TutorialY2Scene';
import { TILE, MAX_COLS, MAX_ROWS, HEADER, PANEL } from './constants';
import { initStats } from './stats';

initStats();

new Phaser.Game({
    type:            Phaser.AUTO,
    width:           MAX_COLS * TILE + PANEL,
    height:          MAX_ROWS * TILE + HEADER,
    backgroundColor: '#060c14',
    scene:           [TitleScene, GameScene, QuoteScene, EndScene, UIScene, TutorialScene, TutorialY2Scene, ToolkitScene, StatsScene, AuthScene, GameY2Scene],
    scale: {
        mode:       Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
});
