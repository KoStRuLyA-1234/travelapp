import {
  Component, EventEmitter, Input, Output, OnChanges, SimpleChanges
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  trigger, transition, style, animate
} from '@angular/animations';

/**
 * Compact mini-calendar for picking a single trip date.
 *
 * Why custom (vs Angular Material datepicker):
 *   - No new npm dep — keeps bundle lean.
 *   - We need season-aware highlighting against the city's bestSeason,
 *     plus locale-correct Monday-first Russian week. Easier to write
 *     directly than to bend a generic widget.
 *
 * Inputs:
 *   bestSeason  — one of 'winter' | 'spring' | 'summer' | 'autumn'
 *                 (what the city is best for). Used to mark each
 *                 day cell as "in season" vs "off-season".
 *   initialDate — preselected ISO date string, optional.
 *   minDate     — earliest selectable date, defaults to today.
 *
 * Outputs:
 *   dateChange   — fires (Date) when the user picks a day.
 *   seasonMatch  — fires (boolean) — true if picked day falls in bestSeason.
 *
 * Layout: ≤320px wide, 7-col grid, 36px touch targets.
 * Notch-safe: the host doesn't dictate margins; parent controls placement.
 */
@Component({
  selector: 'app-trip-date-picker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './trip-date-picker.component.html',
  styleUrl: './trip-date-picker.component.css',
  animations: [
    trigger('monthSlide', [
      transition(':increment', [
        style({ opacity: 0, transform: 'translateX(12px)' }),
        animate('220ms cubic-bezier(0.4, 0, 0.2, 1)',
          style({ opacity: 1, transform: 'translateX(0)' }))
      ]),
      transition(':decrement', [
        style({ opacity: 0, transform: 'translateX(-12px)' }),
        animate('220ms cubic-bezier(0.4, 0, 0.2, 1)',
          style({ opacity: 1, transform: 'translateX(0)' }))
      ])
    ])
  ]
})
export class TripDatePickerComponent implements OnChanges {
  @Input() bestSeason: 'winter' | 'spring' | 'summer' | 'autumn' | null = null;
  @Input() initialDate?: string | Date;
  @Input() minDate?: Date;

  @Output() dateChange  = new EventEmitter<Date>();
  @Output() seasonMatch = new EventEmitter<boolean>();

  /** Currently displayed month (first day, 00:00 local). */
  viewMonth = this.startOfMonth(new Date());
  /** Selected day, null until the user taps. */
  selected: Date | null = null;
  /** Animation counter for monthSlide :increment / :decrement. */
  monthIndex = 0;

  /** Russian Monday-first week. */
  readonly weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  readonly months = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ];

  ngOnChanges(changes: SimpleChanges) {
    if (changes['initialDate'] && this.initialDate) {
      const d = new Date(this.initialDate);
      if (!isNaN(d.getTime())) {
        this.selected = this.stripTime(d);
        this.viewMonth = this.startOfMonth(d);
      }
    }
  }

  /** Build a 6×7 grid of day cells for the current viewMonth. */
  get grid(): DayCell[] {
    const first = this.viewMonth;
    // JS getDay: 0=Sun..6=Sat. Shift so Monday=0.
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(1 - offset);

    const today = this.stripTime(new Date());
    const min   = this.minDate ? this.stripTime(this.minDate) : today;
    const cells: DayCell[] = [];

    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      cells.push({
        date:        d,
        day:         d.getDate(),
        outside:     d.getMonth() !== first.getMonth(),
        isToday:     d.getTime() === today.getTime(),
        isSelected:  !!this.selected && d.getTime() === this.selected.getTime(),
        isPast:      d.getTime() < min.getTime(),
        inSeason:    this.matchesSeason(d)
      });
    }
    return cells;
  }

  pick(cell: DayCell) {
    if (cell.isPast || cell.outside) return;
    this.selected = cell.date;
    this.dateChange.emit(cell.date);
    this.seasonMatch.emit(cell.inSeason);
  }

  prevMonth() {
    const m = new Date(this.viewMonth);
    m.setMonth(m.getMonth() - 1);
    this.viewMonth = m;
    this.monthIndex--;
  }

  nextMonth() {
    const m = new Date(this.viewMonth);
    m.setMonth(m.getMonth() + 1);
    this.viewMonth = m;
    this.monthIndex++;
  }

  get monthLabel(): string {
    return `${this.months[this.viewMonth.getMonth()]} ${this.viewMonth.getFullYear()}`;
  }

  /** Show a hint chip when the picked day is outside the city's best season. */
  get offSeasonHint(): string | null {
    if (!this.selected || !this.bestSeason) return null;
    return this.matchesSeason(this.selected) ? null
      : `Не лучший сезон для города (рекомендуем ${this.seasonLabel(this.bestSeason)})`;
  }

  // ── helpers ────────────────────────────────────────────────────────────

  private matchesSeason(d: Date): boolean {
    if (!this.bestSeason) return false;
    return this.seasonOf(d) === this.bestSeason;
  }

  /** Meteorological seasons (RU convention): Dec-Feb winter, etc. */
  private seasonOf(d: Date): 'winter' | 'spring' | 'summer' | 'autumn' {
    const m = d.getMonth();
    if (m === 11 || m <= 1)  return 'winter';
    if (m >= 2 && m <= 4)    return 'spring';
    if (m >= 5 && m <= 7)    return 'summer';
    return 'autumn';
  }

  private seasonLabel(s: 'winter' | 'spring' | 'summer' | 'autumn'): string {
    return { winter: 'зиму', spring: 'весну', summer: 'лето', autumn: 'осень' }[s];
  }

  private startOfMonth(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  private stripTime(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
}

interface DayCell {
  date: Date;
  day: number;
  outside: boolean;
  isToday: boolean;
  isSelected: boolean;
  isPast: boolean;
  inSeason: boolean;
}
