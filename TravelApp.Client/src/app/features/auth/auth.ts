import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Auth } from '../../core/services/auth';
import {
  trigger, transition, style, animate, keyframes
} from '@angular/animations';

type AuthMode = 'login' | 'register' | 'recovery';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './auth.html',
  styleUrl: './auth.css',
  animations: [
    trigger('shake', [
      transition('false => true', [
        animate('0.45s cubic-bezier(0.36, 0.07, 0.19, 0.97)', keyframes([
          style({ transform: 'translateX(0)', offset: 0 }),
          style({ transform: 'translateX(-8px)', offset: 0.15 }),
          style({ transform: 'translateX(7px)', offset: 0.30 }),
          style({ transform: 'translateX(-6px)', offset: 0.45 }),
          style({ transform: 'translateX(5px)', offset: 0.60 }),
          style({ transform: 'translateX(-3px)', offset: 0.75 }),
          style({ transform: 'translateX(2px)', offset: 0.90 }),
          style({ transform: 'translateX(0)', offset: 1 })
        ]))
      ])
    ]),
    trigger('errorSlide', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-8px)', height: 0, padding: 0 }),
        animate('0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          style({ opacity: 1, transform: 'translateY(0)', height: '*', padding: '*' }))
      ]),
      transition(':leave', [
        animate('0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          style({ opacity: 0, transform: 'translateY(-4px)', height: 0, padding: 0 }))
      ])
    ]),
    trigger('tabMode', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(8px)' }),
        animate('0.3s 0.05s cubic-bezier(0.4, 0, 0.2, 1)',
          style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ])
  ]
})
export class AuthComponent implements OnInit {
  mode: AuthMode = 'login';
  isLoading = false;
  error = '';
  notice = '';
  shaking = false;
  showPassword = false;

  form: FormGroup;

  get isLogin(): boolean    { return this.mode === 'login'; }
  get isRegister(): boolean { return this.mode === 'register'; }
  get isRecovery(): boolean { return this.mode === 'recovery'; }

  constructor(
    private fb: FormBuilder,
    private auth: Auth,
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.form = this.fb.nonNullable.group({
      name: [''],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      homeCity: [''],
      // "Remember me" — preference recorded; Auth service can read it later
      // to choose sessionStorage vs localStorage for the JWT.
      rememberMe: [true]
    });
  }

  togglePasswordVisible() {
    this.showPassword = !this.showPassword;
  }

  ngOnInit() {
    // Legacy ?verified=1 (from the old Supabase redirect) — show a friendly
    // notice and route the user into the login tab. Safe to keep so users
    // bookmarking the old URL don't get a confusing blank page.
    if (this.route.snapshot.queryParamMap.get('verified') === '1') {
      this.notice = 'Готово. Войди с тем же email и паролем.';
      this.mode = 'login';
    }
  }

  setMode(mode: AuthMode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.error = '';
    this.notice = '';
    this.shaking = false;
    this.form.markAsPristine();
    this.form.markAsUntouched();
  }

  fieldInvalid(name: string): boolean {
    const c = this.form.get(name);
    return !!(c?.invalid && c?.touched);
  }

  submit() {
    this.error = '';
    this.notice = '';

    const v = this.form.getRawValue() as { email: string; password: string; name: string; homeCity: string };
    const email = v.email.trim();

    // Recovery flow — backend sends a magic-link / token via email.
    if (this.isRecovery) {
      this.form.controls['email'].markAsTouched();
      if (this.form.controls['email'].invalid) {
        this.triggerShake('Введи корректный email для восстановления пароля.');
        return;
      }
      this.sendRecovery(email);
      return;
    }

    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.triggerShake('Проверь email и пароль. Пароль должен быть не короче 6 символов.');
      return;
    }

    if (this.isRegister && !v.name.trim()) {
      this.triggerShake('Укажи имя для регистрации.');
      return;
    }

    this.isLoading = true;
    const req = {
      email,
      password: v.password,
      name: v.name.trim(),
      homeCity: v.homeCity.trim()
    };

    // Local backend auth — no Supabase, no email verification.
    const action = this.isLogin ? this.auth.login(req) : this.auth.register(req);
    action.subscribe({
      next: () => this.router.navigateByUrl('/', { replaceUrl: true }),
      error: (err) => this.handleAuthError(err, 'Не удалось выполнить вход. Попробуй ещё раз.')
    });
  }

  private sendRecovery(email: string) {
    this.isLoading = true;
    this.auth.forgotPassword(email).subscribe({
      next: () => {
        this.isLoading = false;
        this.notice = `Если ${email} зарегистрирован, мы отправим письмо для восстановления.`;
        this.mode = 'login';
      },
      error: (err: any) => this.handleAuthError(err, 'Не удалось отправить письмо для восстановления.')
    });
  }

  private handleAuthError(err: any, fallback: string) {
    const msg = err?.error?.message ?? err?.error?.msg ?? err?.message ?? fallback;
    this.triggerShake(msg);
    this.isLoading = false;
  }

  private triggerShake(message: string) {
    this.error = message;
    this.shaking = false;
    requestAnimationFrame(() => { this.shaking = true; });
    setTimeout(() => { this.shaking = false; }, 500);
  }
}
