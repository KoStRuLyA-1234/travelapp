import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth } from '../../core/services/auth';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth.html',
  styleUrl: './auth.css'
})
export class AuthComponent {

  isLogin = true;
  isLoading = false;
  error = '';

  email = '';
  password = '';
  name = '';
  homeCity = '';

  constructor(
    private auth: Auth,
    private router: Router
  ) {}

  toggleMode() {
    this.isLogin = !this.isLogin;
    this.error = '';
  }

  submit() {
    if (!this.email || !this.password) {
      this.error = 'Заполни все поля';
      return;
    }

    this.isLoading = true;
    this.error = '';

    const request = {
      email: this.email,
      password: this.password,
      name: this.name,
      homeCity: this.homeCity
    };

    const action = this.isLogin
      ? this.auth.login(request)
      : this.auth.register(request);

    action.subscribe({
      next: () => {
        this.router.navigate(['/']);
      },
      error: (err) => {
        this.error = err.error?.message ?? 'Ошибка. Попробуй ещё раз.';
        this.isLoading = false;
      }
    });
  }
}