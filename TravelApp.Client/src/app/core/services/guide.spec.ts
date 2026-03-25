import { TestBed } from '@angular/core/testing';

import { Guide } from './guide';

describe('Guide', () => {
  let service: Guide;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Guide);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
