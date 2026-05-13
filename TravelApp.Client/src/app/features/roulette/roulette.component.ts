import {
  Component, OnInit, OnDestroy, ElementRef, ViewChild, NgZone
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CityService } from '../../core/services/city.service';
import { Auth } from '../../core/services/auth';
import { City } from '../../core/models/city.model';
import {
  trigger, state, style, animate, transition, keyframes
} from '@angular/animations';

@Component({
  selector: 'app-roulette',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './roulette.component.html',
  styleUrl: './roulette.component.css',
  animations: [
    trigger('resultCard', [
      transition(':enter', [
        animate('0.65s cubic-bezier(0.34, 1.56, 0.64, 1)', keyframes([
          style({ opacity: 0, transform: 'scale(0.7) translateY(40px)', offset: 0 }),
          style({ opacity: 1, transform: 'scale(1.03) translateY(-6px)', offset: 0.75 }),
          style({ opacity: 1, transform: 'scale(1) translateY(0)', offset: 1 }),
        ]))
      ])
    ]),
    trigger('fadeSlide', [
      transition(':enter', [
        animate('0.5s 0.2s cubic-bezier(0.4, 0, 0.2, 1)', keyframes([
          style({ opacity: 0, transform: 'translateY(20px)', offset: 0 }),
          style({ opacity: 1, transform: 'translateY(0)', offset: 1 }),
        ]))
      ])
    ])
  ]
})
export class RouletteComponent implements OnInit, OnDestroy {
  @ViewChild('wheelCanvas', { static: false }) wheelRef!: ElementRef<HTMLCanvasElement>;

  cities: City[] = [];
  nearbyCities: City[] = [];
  isLoading = true;
  isSpinning = false;
  winner: City | null = null;
  homeCity = '';
  spinAngle = 0;
  private raf = 0;
  private velocity = 0;

  constructor(
    private cityService: CityService,
    private auth: Auth,
    private router: Router,
    private ngZone: NgZone
  ) {}

  ngOnInit() {
    const user = this.auth.getUser();
    this.homeCity = user?.homeCity ?? '';
    this.cityService.getCities().subscribe({
      next: (all) => {
        this.cities = all;
        this.nearbyCities = this.pickNearby(all);
        this.isLoading = false;
        setTimeout(() => this.drawWheel(), 80);
      },
      error: () => { this.isLoading = false; }
    });
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.raf);
  }

  /**
   * Pick wheel candidates relative to the user's home city.
   *
   * Strategy:
   *   1. Try to locate the home city in the catalogue (case-insensitive).
   *   2. If found AND it has coordinates, sort the rest of the catalogue
   *      by haversine distance and take the 8 closest.
   *   3. Otherwise fall back to a randomised pick (so the demo still works
   *      for users whose home city isn't in our DB or has null coords).
   */
  private pickNearby(all: City[]): City[] {
    const myCity = this.findHomeCity(all);

    if (myCity && myCity.latitude != null && myCity.longitude != null) {
      return all
        .filter(c => c.id !== myCity.id && c.latitude != null && c.longitude != null)
        .map(c => ({ city: c, dist: this.haversine(myCity, c) }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 8)
        .map(x => x.city);
    }

    // Fallback: random shuffle + slice.
    return [...all].sort(() => Math.random() - 0.5).slice(0, 8);
  }

  private findHomeCity(all: City[]): City | undefined {
    if (!this.homeCity) return undefined;
    const target = this.homeCity.toLowerCase().trim();
    return all.find(c => c.name.toLowerCase().trim() === target);
  }

  /** Great-circle distance in km between two cities with lat/lng. */
  private haversine(a: City, b: City): number {
    const R = 6371; // Earth radius, km
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad((b.latitude ?? 0) - (a.latitude ?? 0));
    const dLon = toRad((b.longitude ?? 0) - (a.longitude ?? 0));
    const lat1 = toRad(a.latitude ?? 0);
    const lat2 = toRad(b.latitude ?? 0);
    const h = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  private drawWheel(extraAngle = 0) {
    const canvas = this.wheelRef?.nativeElement;
    if (!canvas || this.nearbyCities.length === 0) return;
    const ctx = canvas.getContext('2d')!;
    const N = this.nearbyCities.length;
    const arc = (Math.PI * 2) / N;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const r = cx - 8;

    const palette = [
      '#2a6f85', '#6ec1d4', '#182633', '#ffc657',
      '#0b0f14', '#5aa8bd', '#3f7f92', '#24596b'
    ];

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < N; i++) {
      const start = arc * i + extraAngle;
      const end   = arc * (i + 1) + extraAngle;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, end);
      ctx.closePath();
      ctx.fillStyle = palette[i % palette.length];
      ctx.fill();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(start + arc / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.font = 'bold 13px Inter, system-ui, sans-serif';
      const label = this.nearbyCities[i].name.length > 10
        ? this.nearbyCities[i].name.slice(0, 9) + '…'
        : this.nearbyCities[i].name;
      ctx.fillText(label, r - 14, 5);
      ctx.restore();
    }

    // Centre hub
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.fillStyle = '#0b0f14';
    ctx.fill();
    ctx.strokeStyle = 'rgba(110, 193, 212, 0.72)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Outer ring
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(110, 193, 212, 0.34)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  spin() {
    if (this.isSpinning || this.nearbyCities.length === 0) return;
    this.isSpinning = true;
    this.winner = null;

    const totalRotation = (Math.PI * 2) * (8 + Math.random() * 6);
    const duration = 3800 + Math.random() * 1000;
    const start = performance.now();
    const arc = (Math.PI * 2) / this.nearbyCities.length;

    const animate = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - t, 4);
      const angle = totalRotation * ease;

      this.ngZone.runOutsideAngular(() => this.drawWheel(angle));

      if (t < 1) {
        this.raf = requestAnimationFrame(animate);
      } else {
        // The HTML pointer (triangle) sits on TOP of the wheel.
        // In canvas coordinates the top of the circle is at angle 3π/2
        // (canvas angle 0 is at 3 o'clock, increasing clockwise).
        //
        // Sector i (after rotating by `angle`) covers
        //   [arc*i + angle, arc*(i+1) + angle]  (mod 2π).
        // The sector under the pointer satisfies
        //   arc*i + angle ≤ 3π/2 < arc*(i+1) + angle  (mod 2π)
        // → i = floor( ((3π/2 - angle) mod 2π) / arc )
        const TWO_PI = Math.PI * 2;
        const normalised  = ((angle % TWO_PI) + TWO_PI) % TWO_PI;
        const pointerAngle = ((Math.PI * 1.5 - normalised) % TWO_PI + TWO_PI) % TWO_PI;
        const idx = Math.floor(pointerAngle / arc) % this.nearbyCities.length;

        this.ngZone.run(() => {
          this.winner = this.nearbyCities[idx];
          this.isSpinning = false;
          this.fireConfetti();
        });
      }
    };

    this.raf = requestAnimationFrame(animate);
  }

  private fireConfetti() {
    const colors = ['#2a6f85', '#6ec1d4', '#ffc657', '#f5f6f7', '#182633'];
    const burst = (x: number) => {
      const count = 80;
      for (let i = 0; i < count; i++) {
        const el = document.createElement('div');
        el.className = 'confetti-particle';
        const color = colors[Math.floor(Math.random() * colors.length)];
        el.style.cssText = `
          left:${x * 100}%;
          background:${color};
          width:${Math.random() * 8 + 5}px;
          height:${Math.random() * 8 + 5}px;
          border-radius:${Math.random() > 0.5 ? '50%' : '2px'};
          --dx:${(Math.random() - 0.5) * 300}px;
          --dy:${-(Math.random() * 400 + 150)}px;
          --rot:${Math.random() * 720}deg;
        `;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 1800);
      }
    };
    burst(0.3);
    setTimeout(() => burst(0.7), 150);
  }

  openCity() {
    if (this.winner) {
      this.router.navigate(['/cities', this.winner.id]);
    }
  }

  planRoute() {
    if (this.winner) {
      this.router.navigate(['/planner', this.winner.id]);
    }
  }

  respin() {
    this.nearbyCities = this.pickNearby(this.cities);
    this.winner = null;
    setTimeout(() => this.drawWheel(), 40);
  }

  goBack() {
    this.router.navigate(['/']);
  }
}
