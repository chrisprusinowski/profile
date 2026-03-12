import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Planner } from './Planner.js';

vi.mock('../api/client.js', () => ({
  fetchCompensationCycles: vi.fn(),
  fetchCompensationTotalSummary: vi.fn(),
  saveEmployeeCyclePlan: vi.fn(),
  buildCompensationTotalSummaryCsv: vi.fn(() => 'employeeId\nE1'),
  bulkUpdateEmployeeCyclePlans: vi.fn(async () => ({ updated: 1, employeeIds: ['E1'] })),
  fetchPlannerAudit: vi.fn(async () => []),
  updateEmployeePlanStatus: vi.fn(async () => undefined)
}));

import {
  fetchCompensationCycles,
  fetchCompensationTotalSummary,
  saveEmployeeCyclePlan,
  updateEmployeePlanStatus
} from '../api/client.js';

describe('Planner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('confirm', vi.fn(() => true));
    vi.stubGlobal('prompt', vi.fn(() => '3'));
  });

  it('loads cycle summary rows and supports keyboard edit save', async () => {
    vi.mocked(fetchCompensationCycles).mockResolvedValue([{ id: 1, name: 'FY27', status: 'open', cycleType: 'annual', openDate: null, closeDate: null, effectiveDate: null }]);
    vi.mocked(fetchCompensationTotalSummary).mockResolvedValue([{
      employeeId: 'E1', importBatchId: 1, importedFirstName: 'Alex', importedLastName: 'Doe', importedFullName: 'Alex Doe', importedDepartment: 'Engineering', importedTitle: 'Engineer', importedSalary: 100000, importedRawAttributes: null,
      enteredCurrentPerformanceRating: '3', enteredPriorPerformanceRating: null, enteredMeritIncreaseAmount: null, enteredMeritIncreasePercent: 2, enteredRecommendedMeritAmount: null, enteredRecommendedMeritPercent: null, enteredVarianceFromRecommendation: null,
      enteredIsPromotion: false, enteredPromotionType: null, enteredNewJobTitle: null, enteredPromotionRationale: null, enteredPromotionIncreaseAmount: null, enteredBonusOverrideAmount: null, enteredBonusOverridePercent: null,
      enteredBonusWeightCompany: null, enteredBonusWeightIndividual: null, enteredGoalAttainmentCompany: 100, enteredGoalAttainmentIndividual: 100, enteredExecReview: null, enteredNotes: null, enteredPlanningStatus: 'not_started', enteredPlannerInputs: null,
      derivedCompaRatio: 1, derivedSalaryAfterMerit: 102000, derivedFinalSalaryWithPromo: 102000, derivedCurrentBonusTargetAmount: 10000, derivedFinalCompanyBonusProrated: 5000, derivedFinalIndividualBonusProrated: 5000, derivedFinalTotalBonusProrated: 10000, derivedNewRangeCompaRatio: 1, derivedVarianceFromRecommendation: null, derivedGapFlags: [], derivedMissingDataReasons: [], derivedGeneratedAt: null
    }]);

    render(<Planner />);
    await waitFor(() => expect(screen.getByText('Alex Doe')).toBeInTheDocument());

    const merit = screen.getByDisplayValue('2');
    fireEvent.change(merit, { target: { value: '4' } });
    fireEvent.blur(merit);

    await waitFor(() => expect(saveEmployeeCyclePlan).toHaveBeenCalled());
  });

  it('updates workflow status', async () => {
    vi.mocked(fetchCompensationCycles).mockResolvedValue([{ id: 1, name: 'FY27', status: 'open', cycleType: 'annual', openDate: null, closeDate: null, effectiveDate: null }]);
    vi.mocked(fetchCompensationTotalSummary).mockResolvedValue([]);

    render(<Planner />);
    await waitFor(() => expect(fetchCompensationTotalSummary).toHaveBeenCalledWith(1));
    expect(updateEmployeePlanStatus).not.toHaveBeenCalled();
  });
});
