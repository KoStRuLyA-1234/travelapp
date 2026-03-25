import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RoutePlanner } from './route-planner';

describe('RoutePlanner', () => {
  let component: RoutePlanner;
  let fixture: ComponentFixture<RoutePlanner>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoutePlanner],
    }).compileComponents();

    fixture = TestBed.createComponent(RoutePlanner);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
