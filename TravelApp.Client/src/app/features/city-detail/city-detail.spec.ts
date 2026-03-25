import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CityDetail } from './city-detail';

describe('CityDetail', () => {
  let component: CityDetail;
  let fixture: ComponentFixture<CityDetail>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CityDetail],
    }).compileComponents();

    fixture = TestBed.createComponent(CityDetail);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
