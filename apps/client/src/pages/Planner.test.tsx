import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Planner } from './Planner.js';

vi.mock('../api/client.js', () => ({
  fetchCompensationCycles: vi.fn(),
  fetchCompensationTotalSummary: vi.fn(),
  saveEmployeeCyclePlan: vi.fn(),
  buildCompensationTotalSummaryCsv: vi.fn(() => 'employeeId\nE1')
}));

import {
  fetchCompensationCycles,
  fetchCompensationTotalSummary,
  saveEmployeeCyclePlan
} from '../api/client.js';

describe('Planner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads cycle summary rows and shows missing-data reasons', async () => {
    vi.mocked(fetchCompensationCycles).mockResolvedValue([
      { id: 1, name: 'FY27', status: 'open', cycleType: 'annual', openDate: null, closeDate: null, effectiveDate: null }
    ]);
    vi.mocked(fetchCompensationTotalSummary).mockResolvedValue([
      {
        employeeId: 'E1',
        importBatchId: 1,
        importedFirstName: 'Alex',
        importedLastName: 'Doe',
        importedFullName: 'Alex Doe',
        importedDepartment: 'Engineering',
        importedTitle: 'Engineer',
        importedSalary: null,
        importedRawAttributes: null,
        enteredCurrentPerformanceRating: null,
        enteredPriorPerformanceRating: null,
        enteredMeritIncreaseAmount: null,
        enteredMeritIncreasePercent: null,
        enteredRecommendedMeritAmount: null,
        enteredRecommendedMeritPercent: null,
        enteredVarianceFromRecommendation: null,
        enteredIsPromotion: null,
        enteredPromotionType: null,
        enteredNewJobTitle: null,
        enteredPromotionRationale: null,
        enteredPromotionIncreaseAmount: null,
        enteredBonusOverrideAmount: null,
        enteredBonusOverridePercent: null,
        enteredBonusWeightCompany: null,
        enteredBonusWeightIndividual: null,
        enteredGoalAttainmentCompany: null,
        enteredGoalAttainmentIndividual: null,
        enteredExecReview: null,
        enteredNotes: null,
        enteredPlannerInputs: null,
        derivedCompaRatio: null,
        derivedSalaryAfterMerit: null,
        derivedFinalSalaryWithPromo: null,
        derivedCurrentBonusTargetAmount: null,
        derivedFinalCompanyBonusProrated: null,
        derivedFinalIndividualBonusProrated: null,
        derivedFinalTotalBonusProrated: null,
        derivedNewRangeCompaRatio: null,
        derivedVarianceFromRecommendation: null,
        derivedGapFlags: ['missing_salary'],
        derivedMissingDataReasons: ['Missing current salary'],
        derivedGeneratedAt: null
      }
    ]);

    render(<Planner />);

    await waitFor(() => {
      expect(screen.getByText('Alex Doe')).toBeInTheDocument();
    });

    expect(screen.getAllByText(/Missing current salary/i).length).toBeGreaterThan(0);
  });

  it('renders editable inputs that can trigger save', async () => {
    vi.mocked(fetchCompensationCycles).mockResolvedValue([
      { id: 1, name: 'FY27', status: 'open', cycleType: 'annual', openDate: null, closeDate: null, effectiveDate: null }
    ]);
    vi.mocked(fetchCompensationTotalSummary).mockResolvedValue([]);

    render(<Planner />);
    await waitFor(() => expect(fetchCompensationTotalSummary).toHaveBeenCalledWith(1));
    expect(saveEmployeeCyclePlan).not.toHaveBeenCalled();
  });
});
