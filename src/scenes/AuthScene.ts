import Phaser from 'phaser';
import { TILE, MAX_COLS, MAX_ROWS, HEADER, PANEL } from '../constants';
import { signIn, signUp } from '../auth';

const W = MAX_COLS * TILE + PANEL;
const H = MAX_ROWS * TILE + HEADER;

export default class AuthScene extends Phaser.Scene {
    private formContainer: HTMLDivElement | null = null;

    constructor() { super('AuthScene'); }

    create() {
        this.cameras.main.setBackgroundColor(0x060c14);
        this.add.rectangle(W / 2, H / 2, W, H, 0x060c14);

        // Create HTML form overlay
        this.formContainer = document.createElement('div');
        Object.assign(this.formContainer.style, {
            position: 'absolute',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex', gap: '48px', alignItems: 'flex-start',
            zIndex: '1000',
        });

        const inputStyle: Partial<CSSStyleDeclaration> = {
            width: '220px', padding: '10px 14px',
            fontSize: '15px', border: '1px solid #334466',
            borderRadius: '6px', backgroundColor: '#0a1420',
            color: '#c8e4f4', outline: 'none',
            fontFamily: 'inherit', boxSizing: 'border-box',
        };

        const btnStyle: Partial<CSSStyleDeclaration> = {
            width: '100%', padding: '10px 0', fontSize: '15px', fontWeight: 'bold',
            border: 'none', borderRadius: '6px', cursor: 'pointer',
            fontFamily: 'inherit',
        };

        const headingStyle: Partial<CSSStyleDeclaration> = {
            color: '#c8e4f4', fontSize: '20px', fontWeight: 'bold',
            textAlign: 'center', marginBottom: '8px',
        };

        const makeInput = (type: string, placeholder: string) => {
            const el = document.createElement('input');
            el.type = type;
            el.placeholder = placeholder;
            Object.assign(el.style, inputStyle);
            el.addEventListener('focus', () => this.input.keyboard!.enabled = false);
            el.addEventListener('blur',  () => this.input.keyboard!.enabled = true);
            return el;
        };

        const makeErr = () => {
            const el = document.createElement('div');
            Object.assign(el.style, {
                color: '#ff6666', fontSize: '13px', minHeight: '18px',
                textAlign: 'center', wordBreak: 'break-word',
            });
            return el;
        };

        const makeColumn = () => {
            const col = document.createElement('div');
            Object.assign(col.style, {
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: '10px', width: '250px',
            });
            return col;
        };

        // ── Sign Up (left) ──────────────────────────────────────────────────
        const leftCol = makeColumn();
        const leftHeading = document.createElement('div');
        leftHeading.textContent = 'Sign Up';
        Object.assign(leftHeading.style, headingStyle);

        const nameInput    = makeInput('text', 'Display name');
        const signUpEmail  = makeInput('email', 'Email');
        const signUpPass   = makeInput('password', 'Password');
        const signUpErr    = makeErr();

        const signUpBtn = document.createElement('button');
        signUpBtn.textContent = 'Create Account';
        Object.assign(signUpBtn.style, btnStyle, {
            backgroundColor: '#228844', color: '#ffffff',
        });

        signUpBtn.onclick = async () => {
            signUpErr.textContent = '';
            if (!nameInput.value.trim()) {
                signUpErr.textContent = 'Please enter a display name';
                return;
            }
            try {
                await signUp(signUpEmail.value, signUpPass.value, nameInput.value.trim());
                this.cleanup();
                this.scene.start('TitleScene');
            } catch (e: unknown) {
                signUpErr.textContent = (e as { message?: string }).message ?? 'Sign up failed';
            }
        };

        leftCol.append(leftHeading, nameInput, signUpEmail, signUpPass, signUpErr, signUpBtn);

        // ── Divider ─────────────────────────────────────────────────────────
        const divider = document.createElement('div');
        Object.assign(divider.style, {
            width: '1px', backgroundColor: '#334466', alignSelf: 'stretch',
        });

        // ── Sign In (right) ─────────────────────────────────────────────────
        const rightCol = makeColumn();
        const rightHeading = document.createElement('div');
        rightHeading.textContent = 'Sign In';
        Object.assign(rightHeading.style, headingStyle);

        const signInEmail = makeInput('email', 'Email');
        const signInPass  = makeInput('password', 'Password');
        const signInErr   = makeErr();

        const signInBtn = document.createElement('button');
        signInBtn.textContent = 'Sign In';
        Object.assign(signInBtn.style, btnStyle, {
            backgroundColor: '#334466', color: '#c8e4f4',
        });

        signInBtn.onclick = async () => {
            signInErr.textContent = '';
            try {
                await signIn(signInEmail.value, signInPass.value);
                this.cleanup();
                this.scene.start('TitleScene');
            } catch (e: unknown) {
                signInErr.textContent = (e as { message?: string }).message ?? 'Sign in failed';
            }
        };

        rightCol.append(rightHeading, signInEmail, signInPass, signInErr, signInBtn);

        this.formContainer.append(leftCol, divider, rightCol);
        document.body.append(this.formContainer);

        // Back button (Phaser)
        const backBtn = this.add.text(W / 2, H - 60, 'Back', {
            fontSize: '22px', color: '#556677',
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        backBtn.on('pointerover', () => backBtn.setColor('#aabbcc'));
        backBtn.on('pointerout', () => backBtn.setColor('#556677'));
        backBtn.on('pointerdown', () => {
            this.cleanup();
            this.scene.start('TitleScene');
        });
    }

    private cleanup() {
        if (this.formContainer) {
            this.formContainer.remove();
            this.formContainer = null;
        }
        if (this.input.keyboard) this.input.keyboard.enabled = true;
    }

    shutdown() { this.cleanup(); }
}
