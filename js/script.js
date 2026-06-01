// Global function to update net advantage for a specific year
        function updateNetAdvantage(year) {
            console.log('updateNetAdvantage called with year:', year);

            const selectedYear = parseInt(year);
            if (isNaN(selectedYear) || selectedYear < 1) {
                console.log('Invalid year:', year);
                return;
            }

            // Check if we have analysis data
            if (!window.analysisData || !window.analysisData.netAdvantage) {
                console.log('No analysis data available yet - please run calculation first');
                alert('Please wait for the initial calculation to complete, then try again.');
                return;
            }

            // Get all relevant data for the selected year
            const data = window.analysisData;
            const selectedYearAdvantage = data.netAdvantage[selectedYear];
            const rothBalance = data.rothIRA[selectedYear];
            const traditionalBalance = data.traditionalIRA[selectedYear];
            const opportunityCost = data.opportunityCost[selectedYear];
            const totalTaxesPaid = data.totalTaxesPaid;

            if (selectedYearAdvantage === undefined) {
                console.log('No data for year:', selectedYear);
                return;
            }

            // Format currency function
            const formatCurrency = (v) => new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            }).format(v);

            console.log('Year', selectedYear, 'data:');
            console.log('- Net Advantage:', formatCurrency(selectedYearAdvantage));
            console.log('- Roth Balance:', formatCurrency(rothBalance));
            console.log('- Traditional Balance:', formatCurrency(traditionalBalance));
            console.log('- Opportunity Cost:', formatCurrency(opportunityCost));
            console.log('- Total Taxes Paid:', formatCurrency(totalTaxesPaid));

            // Show conversion details if multi-year
            if (data.inputs && data.inputs.isMultiYear) {
                console.log('Multi-year conversion details:');
                console.log('- Total Conversion Amount:', formatCurrency(data.inputs.totalConversionAmount));
                console.log('- Conversion Years:', data.inputs.conversionYears);
                console.log('- Strategy:', data.inputs.conversionStrategy);

                // Show conversions by year
                if (data.inputs.conversions) {
                    console.log('Conversions by year:');
                    data.inputs.conversions.forEach(conv => {
                        console.log(`  Year ${conv.year}: ${formatCurrency(conv.amount)}`);
                    });
                }
            }

            const formatPercent = (v) => isNaN(v) ? '0.0%' : (v * 100).toFixed(1) + '%';

            // Calculate ROI for selected year
            const conversionROI = totalTaxesPaid > 0 ? ((selectedYearAdvantage / totalTaxesPaid) * 100) : 0;

            // Find break-even year (first year where net advantage becomes positive)
            let breakEvenYear = -1;
            for (let i = 1; i < data.netAdvantage.length; i++) {
                if (data.netAdvantage[i] > 0) {
                    breakEvenYear = i;
                    break;
                }
            }

            // Update all relevant metric cards
            const metricCards = document.querySelectorAll('.metric-card');
            let netAdvantageUpdated = false;
            let roiUpdated = false;

            metricCards.forEach(card => {
                const label = card.querySelector('.metric-label');
                const valueElement = card.querySelector('.metric-value');

                if (label && valueElement) {
                    if (label.textContent.includes('Net Advantage at Year')) {
                        valueElement.textContent = formatCurrency(selectedYearAdvantage);
                        valueElement.className = `metric-value ${selectedYearAdvantage >= 0 ? 'positive' : 'negative'}`;
                        label.textContent = `Net Advantage at Year ${selectedYear}`;
                        netAdvantageUpdated = true;
                        console.log('Updated Net Advantage card');
                    }
                    else if (label.textContent.includes('Conversion ROI')) {
                        valueElement.textContent = formatPercent(conversionROI / 100);
                        valueElement.className = `metric-value ${conversionROI >= 0 ? 'positive' : 'negative'}`;
                        roiUpdated = true;
                        console.log('Updated ROI card');
                    }
                }
            });

            if (!netAdvantageUpdated) {
                console.log('Could not find net advantage metric card to update');
            }

            console.log('Successfully updated metrics for year', selectedYear);
        }

        document.addEventListener('DOMContentLoaded', function () {
            let charts = {};
            let analysisData = {};
            let savedScenarios = [];
            try { savedScenarios = JSON.parse(localStorage.getItem('awmRothScenarios') || '[]'); } catch (e) { savedScenarios = []; }

            // Editorial chart theme (AWM design system): ink ticks, faint ink grid.
            if (window.Chart) {
                Chart.defaults.font.family = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
                Chart.defaults.font.size = 11;
                Chart.defaults.color = 'rgba(30, 42, 74, 0.55)';
                Chart.defaults.borderColor = 'rgba(30, 42, 74, 0.08)';
            }

            // Shared design-system chart palette
            const CHART_COLORS = {
                coral: '#c0562a',          // primary outcome
                ocean: '#2f6f8f',          // comparison
                inkFaint: 'rgba(30, 42, 74, 0.45)', // tertiary / baseline
                ink: '#1e2a4a'
            };

            // 2026 federal tax assumptions (IRS Rev. Proc. 2025-32, as amended by OBBBA which made the
            // TCJA 10/12/22/24/32/35/37% schedule permanent). Brackets/deductions switch by filing status.
            const seniorBonusPhaseoutRate = 0.06;
            const seniorBonusFirstYear = 2025;
            const seniorBonusLastYear = 2028;
            const projectionBaseYear = 2026;                  // projection year 0 maps to calendar 2026

            const californiaBehavioralHealthThreshold = 1000000;
            const californiaBehavioralHealthTaxRate = 0.01;

            // Annual per-person Part B + Part D IRMAA surcharge above the base premium, by tier (≈2025).
            const IRMAA_SURCHARGES = [1060, 2650, 4250, 5840, 6370];

            const FILING_CONFIGS = {
                mfj: {
                    label: 'Married Filing Jointly',
                    standardDeduction: 32200,
                    seniorBonusMax: 12000,            // both spouses 65+ assumed
                    seniorBonusPhaseoutStart: 150000,
                    ssBase1: 32000, ssBase2: 44000,   // Social Security provisional-income thresholds
                    medicareBeneficiaries: 2,
                    irmaaThresholds: [212000, 266000, 334000, 400000, 750000],
                    niitThreshold: 250000,            // 3.8% NIIT MAGI threshold (MFJ, not indexed)
                    ltcg0Top: 96700, ltcg15Top: 600050,  // 2026 long-term capital-gains breakpoints (MFJ)
                    brackets: [
                        { min: 0, max: 24800, rate: 0.10 },
                        { min: 24800, max: 100800, rate: 0.12 },
                        { min: 100800, max: 211400, rate: 0.22 },
                        { min: 211400, max: 403550, rate: 0.24 },
                        { min: 403550, max: 512450, rate: 0.32 },
                        { min: 512450, max: 768700, rate: 0.35 },
                        { min: 768700, max: Infinity, rate: 0.37 }
                    ]
                },
                single: {
                    label: 'Single',
                    standardDeduction: 16100,
                    seniorBonusMax: 6000,
                    seniorBonusPhaseoutStart: 75000,
                    ssBase1: 25000, ssBase2: 34000,
                    medicareBeneficiaries: 1,
                    irmaaThresholds: [106000, 133000, 167000, 200000, 500000],
                    niitThreshold: 200000,            // 3.8% NIIT MAGI threshold (single, not indexed)
                    ltcg0Top: 48350, ltcg15Top: 533400,  // 2026 long-term capital-gains breakpoints (single)
                    brackets: [
                        { min: 0, max: 12400, rate: 0.10 },
                        { min: 12400, max: 50400, rate: 0.12 },
                        { min: 50400, max: 105700, rate: 0.22 },
                        { min: 105700, max: 201775, rate: 0.24 },
                        { min: 201775, max: 256225, rate: 0.32 },
                        { min: 256225, max: 640600, rate: 0.35 },
                        { min: 640600, max: Infinity, rate: 0.37 }
                    ]
                }
            };

            // Active federal config (mutated by setFilingStatus before each calculation).
            let activeFiling = FILING_CONFIGS.mfj;
            let federalTaxBrackets = activeFiling.brackets;
            let federalStandardDeduction = activeFiling.standardDeduction;
            let seniorBonusDeductionMax = activeFiling.seniorBonusMax;
            let seniorBonusPhaseoutStart = activeFiling.seniorBonusPhaseoutStart;

            function setFilingStatus(status) {
                activeFiling = FILING_CONFIGS[status] || FILING_CONFIGS.mfj;
                federalTaxBrackets = activeFiling.brackets;
                federalStandardDeduction = activeFiling.standardDeduction;
                seniorBonusDeductionMax = activeFiling.seniorBonusMax;
                seniorBonusPhaseoutStart = activeFiling.seniorBonusPhaseoutStart;
            }

            // Taxable portion of Social Security (provisional-income method, 0/50/85% tiers).
            function taxableSocialSecurity(ssBenefit, otherOrdinaryIncome) {
                if (ssBenefit <= 0) return 0;
                const provisional = otherOrdinaryIncome + 0.5 * ssBenefit;
                const b1 = activeFiling.ssBase1, b2 = activeFiling.ssBase2;
                if (provisional <= b1) return 0;
                if (provisional <= b2) return Math.min(0.5 * ssBenefit, 0.5 * (provisional - b1));
                return Math.min(0.85 * ssBenefit, 0.85 * (provisional - b2) + Math.min(0.5 * ssBenefit, 0.5 * (b2 - b1)));
            }

            // Annual Medicare IRMAA surcharge (Part B + D) for the household at a given MAGI.
            function irmaaCost(magi) {
                const t = activeFiling.irmaaThresholds;
                let tier = 0;
                for (let i = 0; i < t.length; i++) if (magi > t[i]) tier = i + 1;
                return tier === 0 ? 0 : IRMAA_SURCHARGES[tier - 1] * activeFiling.medicareBeneficiaries;
            }

            // IRMAA tier (0 = standard premium, 1–5 = surcharge tiers) for a given MAGI.
            function irmaaTier(magi) {
                const t = activeFiling.irmaaThresholds;
                let tier = 0;
                for (let i = 0; i < t.length; i++) if (magi > t[i]) tier = i + 1;
                return tier;
            }

            // Progressive long-term capital-gains tax: the gain stacks on top of ordinary taxable
            // income and is taxed across the 0/15/20% breakpoints (so a big conversion can push gains
            // into a higher LTCG bracket that year).
            function progressiveLTCG(gain, ordinaryTaxableIncome) {
                if (gain <= 0) return 0;
                const base = Math.max(0, ordinaryTaxableIncome);
                const end = base + gain;
                const t0 = activeFiling.ltcg0Top, t15 = activeFiling.ltcg15Top;
                const at15 = Math.max(0, Math.min(end, t15) - Math.max(base, t0));
                const at20 = Math.max(0, end - Math.max(base, t15));
                return at15 * 0.15 + at20 * 0.20;   // the 0% band contributes no tax
            }


            const stateTaxInfo = {
                'NY': {
                    name: 'New York',
                    brackets: [
                        { min: 0, max: 17150, rate: 0.04 },
                        { min: 17150, max: 23600, rate: 0.045 },
                        { min: 23600, max: 27900, rate: 0.0525 },
                        { min: 27900, max: 161550, rate: 0.055 },
                        { min: 161550, max: 323200, rate: 0.06 },
                        { min: 323200, max: 2155350, rate: 0.0685 },
                        { min: 2155350, max: 5000000, rate: 0.0965 },
                        { min: 5000000, max: 25000000, rate: 0.103 },
                        { min: 25000000, max: Infinity, rate: 0.109 }
                    ],
                    standardDeduction: 16050
                },
                'NJ': {
                    name: 'New Jersey',
                    brackets: [
                        { min: 0, max: 20000, rate: 0.014 },
                        { min: 20000, max: 50000, rate: 0.0175 },
                        { min: 50000, max: 70000, rate: 0.0245 },
                        { min: 70000, max: 80000, rate: 0.035 },
                        { min: 80000, max: 150000, rate: 0.05525 },
                        { min: 150000, max: 500000, rate: 0.0637 },
                        { min: 500000, max: 1000000, rate: 0.0897 },
                        { min: 1000000, max: Infinity, rate: 0.1075 }
                    ],
                    standardDeduction: 0
                },
                'CA': {
                    name: 'California',
                    brackets: [
                        { min: 0, max: 22158, rate: 0.01 },
                        { min: 22158, max: 52528, rate: 0.02 },
                        { min: 52528, max: 82904, rate: 0.04 },
                        { min: 82904, max: 115084, rate: 0.06 },
                        { min: 115084, max: 145448, rate: 0.08 },
                        { min: 145448, max: 742958, rate: 0.093 },
                        { min: 742958, max: 891542, rate: 0.103 },
                        { min: 891542, max: 1485906, rate: 0.113 },
                        { min: 1485906, max: Infinity, rate: 0.123 }
                    ],
                    standardDeduction: 11412,
                    behavioralHealthTaxRate: californiaBehavioralHealthTaxRate,
                    behavioralHealthThreshold: californiaBehavioralHealthThreshold
                },
                'FL': { name: 'Florida', brackets: [], standardDeduction: 0 },
                'TX': { name: 'Texas', brackets: [], standardDeduction: 0 },
                'other': { name: 'No State Tax', brackets: [], standardDeduction: 0 }
            };

            const rmdFactors = {
                73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1, 80: 20.2,
                81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2, 87: 14.4, 88: 13.7,
                89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1, 94: 9.5, 95: 8.9, 96: 8.4,
                97: 7.8, 98: 7.3, 99: 6.8, 100: 6.4
            };

            // Utility functions
            const formatCurrency = (v) => isNaN(v) ? '$0' : new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            }).format(v);

            const formatPercent = (v) => isNaN(v) ? '0.0%' : (v * 100).toFixed(1) + '%';

            const parseInputValue = (v) => {
                const p = parseFloat(String(v).replace(/[,$]/g, ''));
                return isNaN(p) ? 0 : p;
            };

            const getInputValue = (id) => {
                const el = document.getElementById(id);
                if (!el) return 0;
                return el.dataset.type === 'currency' ? parseInputValue(el.value) : parseFloat(el.value) || 0;
            };

            const normalizeAnalysisYear = (value, maxYears = 45) => {
                const parsedYear = Math.floor(Number(value));
                if (Number.isNaN(parsedYear)) return maxYears;
                return Math.min(maxYears, Math.max(1, parsedYear));
            };

            // Enhanced tax calculation functions
            const calculateTax = (income, brackets, deduction = 0) => {
                const taxable = Math.max(0, income - deduction);
                return brackets.reduce((acc, br) => {
                    if (taxable > br.min) {
                        const taxableInBracket = Math.min(taxable, br.max) - br.min;
                        return acc + (taxableInBracket * br.rate);
                    }
                    return acc;
                }, 0);
            };

            const getFederalTaxableIncome = (income, extraDeduction = 0) => Math.max(0, income - (federalStandardDeduction + extraDeduction));
            const getFederalGrossCeilingForBracket = (bracket, extraDeduction = 0) => bracket.max + federalStandardDeduction + extraDeduction;

            // OBBBA senior bonus deduction (tax years 2025–2028, age 65+), with MFJ MAGI phaseout.
            const getSeniorBonusDeduction = (magi, age, calendarYear) => {
                if (age < 65) return 0;
                if (calendarYear < seniorBonusFirstYear || calendarYear > seniorBonusLastYear) return 0;
                const reduction = Math.max(0, magi - seniorBonusPhaseoutStart) * seniorBonusPhaseoutRate;
                return Math.max(0, seniorBonusDeductionMax - reduction);
            };

            const calculateFederalTax = (income, extraDeduction = 0) =>
                calculateTax(income, federalTaxBrackets, federalStandardDeduction + extraDeduction);

            const calculateStateTax = (income, state) => {
                const info = stateTaxInfo[state];
                if (!info || info.brackets.length === 0) return 0;
                const taxableIncome = Math.max(0, income - info.standardDeduction);
                let tax = calculateTax(income, info.brackets, info.standardDeduction);
                if (state === 'CA' && taxableIncome > info.behavioralHealthThreshold) {
                    tax += (taxableIncome - info.behavioralHealthThreshold) * info.behavioralHealthTaxRate;
                }
                return tax;
            };

            const getMarginalRate = (income, brackets, deduction = 0) => {
                if (!brackets || brackets.length === 0) return 0;
                const taxable = Math.max(0, income - deduction);
                const bracket = brackets.find(b => taxable <= b.max);
                return bracket ? bracket.rate : brackets[brackets.length - 1].rate;
            };

            const calculateMarginalFederalTaxRate = (income) => getMarginalRate(income, federalTaxBrackets, federalStandardDeduction);
            const calculateMarginalStateTaxRate = (income, state) => {
                const info = stateTaxInfo[state];
                if (!info || !info.brackets || info.brackets.length === 0) return 0;
                const taxableIncome = Math.max(0, income - info.standardDeduction);
                const baseRate = getMarginalRate(income, info.brackets, info.standardDeduction);
                if (state === 'CA' && taxableIncome > info.behavioralHealthThreshold) {
                    return baseRate + info.behavioralHealthTaxRate;
                }
                return baseRate;
            };

            // Effective (blended) ordinary-income tax rate for valuing a traditional IRA at retirement.
            // Rather than taxing the whole balance at a single top marginal rate (which overstates the
            // hit on a lump sum), this models a realistic annual drawdown: it derives the blended
            // effective rate at the retiree's income level (a representative 4%-of-balance withdrawal,
            // or the RMD if larger, plus Social Security) and applies that to the balance.
            const getEffectiveRetirementRate = (balance, rmd, inputs) => {
                const withdrawal = Math.max(rmd, balance * 0.04);
                const otherIncome = withdrawal + (inputs.otherRetirementIncome || 0);
                // Only the taxable portion of Social Security (provisional-income method) is ordinary income.
                const taxableSS = inputs.includeSocialSecurity ? taxableSocialSecurity(inputs.socialSecurityBenefit, otherIncome) : 0;
                const ordinaryIncome = otherIncome + taxableSS;
                if (ordinaryIncome <= 0) return 0;
                const fed = calculateFederalTax(ordinaryIncome) / ordinaryIncome;
                // Retirement-era withdrawals are taxed in the retirement state of residence.
                const state = calculateStateTax(ordinaryIncome, inputs.retirementState || inputs.stateResidency) / ordinaryIncome;
                return fed + state;
            };

            // After-tax value of a taxable side account (long-term capital gains on net growth only).
            const afterTaxTaxable = (value, basis, capitalGainsRate) =>
                value - Math.max(0, value - basis) * capitalGainsRate;

            // Enhanced input gathering
            function getCurrentInputs() {
                // Activate the federal brackets/deductions for the selected filing status first.
                setFilingStatus(document.getElementById('filingStatus').value);
                return {
                    clientName: '',
                    stateResidency: document.getElementById('stateResidency').value,
                    retirementState: document.getElementById('relocateInRetirement').checked
                        ? document.getElementById('retirementState').value
                        : document.getElementById('stateResidency').value,
                    relocateInRetirement: document.getElementById('relocateInRetirement').checked,
                    otherRetirementIncome: getInputValue('otherRetirementIncome'),
                    currentAge: getInputValue('currentAge'),
                    retirementAge: getInputValue('retirementAge'),
                    iraBalance: getInputValue('iraBalance'),
                    currentIncome: getInputValue('currentIncome'),
                    incomeGrowthRate: getInputValue('incomeGrowthRate') / 100,
                    isMultiYear: document.getElementById('multiYearStrategy').checked,
                    conversionAmount: getInputValue('conversionAmount'),
                    totalConversionAmount: getInputValue('totalConversionAmount'),
                    conversionYears: getInputValue('conversionYears'),
                    conversionStrategy: document.getElementById('conversionStrategy').value,
                    maxTaxBracket: getInputValue('maxTaxBracket') / 100,
                    preRetirementReturn: getInputValue('preRetirementReturn') / 100,
                    postRetirementReturn: getInputValue('postRetirementReturn') / 100,
                    inflationRate: getInputValue('inflationRate') / 100,
                    adjustForInflation: document.getElementById('adjustForInflation').checked,
                    discountRate: getInputValue('discountRate') / 100,
                    outsideFundsPct: getInputValue('outsideFundsPct') / 100,
                    taxableAccountReturn: getInputValue('taxableAccountReturn') / 100,
                    filingStatus: document.getElementById('filingStatus').value,
                    enableIRMAA: document.getElementById('enableIRMAA').checked,
                    enableNIIT: document.getElementById('enableNIIT').checked,
                    progressiveCapGains: document.getElementById('progressiveCapGains').checked,
                    stepUpAtDeath: document.getElementById('stepUpAtDeath').checked,
                    modelSurvivor: document.getElementById('modelSurvivor').checked,
                    survivorAge: getInputValue('survivorAge'),
                    modelHeir: document.getElementById('modelHeir').checked,
                    heirTaxRate: getInputValue('heirTaxRate') / 100,
                    customStateRate: getInputValue('customStateRate') / 100,
                    rmdAge: getInputValue('rmdAge'),
                    includeSocialSecurity: document.getElementById('includeSocialSecurity').checked,
                    socialSecurityBenefit: getInputValue('socialSecurityBenefit'),
                    capitalGainsRate: getInputValue('capitalGainsRate') / 100,
                    enableAssetDiscount: document.getElementById('enableAssetDiscount').checked,
                    valuationDiscount: getInputValue('valuationDiscount') / 100,
                    operationalReduction: getInputValue('operationalReduction') / 100,
                    discountStrategy: document.getElementById('discountStrategy').value,
                    analysisYear: normalizeAnalysisYear(getInputValue('analysisYear')),
                };
            }

            // Enhanced conversion amount calculation
            function getConversionAmounts(inputs) {
                if (!inputs.isMultiYear) {
                    return [{ year: 0, amount: inputs.conversionAmount }];
                }

                const { totalConversionAmount: total, conversionYears: years, conversionStrategy: strategy, maxTaxBracket, currentIncome } = inputs;

                if (years <= 0) return [];

                const conversions = [];

                if (strategy === 'optimized') {
                    const chosen = federalTaxBrackets.find(b => b.rate === maxTaxBracket) || federalTaxBrackets[2];
                    // If current income already sits above the chosen bracket, there is no headroom
                    // in it — fall back to filling the bracket that currently contains the client's
                    // income so the optimizer still converts (instead of producing nothing).
                    const currentTaxable = getFederalTaxableIncome(currentIncome);
                    const containing = federalTaxBrackets.find(b => currentTaxable <= b.max) || federalTaxBrackets[federalTaxBrackets.length - 1];
                    const targetBracket = chosen.max >= containing.max ? chosen : containing;
                    const baseCeiling = targetBracket.max + federalStandardDeduction;

                    let remainingAmount = total;
                    for (let i = 0; i < years && remainingAmount > 0; i++) {
                        // Raise the bracket-fill ceiling by the OBBBA senior bonus deduction when the
                        // converting year falls in the age-65+/2025–2028 window (0 otherwise).
                        const extraDeduction = getSeniorBonusDeduction(baseCeiling, inputs.currentAge + i, projectionBaseYear + i);
                        const targetIncome = getFederalGrossCeilingForBracket(targetBracket, extraDeduction);
                        const growingIncome = currentIncome * Math.pow(1 + inputs.incomeGrowthRate, i);
                        // Top bracket has no ceiling (Infinity), so there is no headroom to "fill" —
                        // spread the remaining amount evenly across the remaining years instead of
                        // dumping it all in year one.
                        const roomInBracket = targetBracket.max === Infinity
                            ? remainingAmount / (years - i)
                            : Math.max(0, targetIncome - growingIncome);
                        const conversionAmount = Math.min(remainingAmount, roomInBracket);

                        conversions.push({ year: i, amount: conversionAmount });
                        remainingAmount -= conversionAmount;
                    }
                } else {
                    const amount = total / years;
                    for (let i = 0; i < years; i++) {
                        conversions.push({ year: i, amount });
                    }
                }

                return conversions;
            }

            // Asset discount calculation function
            function calculateAssetDiscount(originalValue, inputs) {
                if (!inputs.enableAssetDiscount) {
                    return originalValue;
                }

                // Step 1: Apply operational reduction (IDCs, startup costs)
                const afterOperationalReduction = originalValue * (1 - inputs.operationalReduction);

                // Step 2: Apply valuation discounts (DLOM + Minority Interest)
                const totalValuationDiscount = inputs.valuationDiscount;
                const discountAmount = afterOperationalReduction * totalValuationDiscount;
                const finalDiscountedValue = afterOperationalReduction - discountAmount;

                return Math.max(finalDiscountedValue, 0); // Ensure non-negative
            }

            // Calculate effective discount rate for display
            function calculateEffectiveDiscountRate(originalValue, discountedValue) {
                if (originalValue <= 0) return 0;
                return (originalValue - discountedValue) / originalValue;
            }

            function getInflationFactor(year, inputs) {
                if (!inputs.adjustForInflation) return 1;
                return Math.pow(1 + inputs.inflationRate, year);
            }

            function getDisplayValue(value, year, inputs) {
                return value / getInflationFactor(year, inputs);
            }

            // Enhanced calculation engine
            function performCalculations(inputs) {
                // Activate the right federal brackets/deductions for this run (keeps the function pure
                // for programmatic callers such as Monte Carlo / sensitivity).
                setFilingStatus(inputs.filingStatus);

                // A user-supplied flat rate makes "Other / no-listed-state" a real (e.g. IL, MA) state.
                stateTaxInfo.other.brackets = inputs.customStateRate > 0
                    ? [{ min: 0, max: Infinity, rate: inputs.customStateRate }]
                    : [];
                stateTaxInfo.other.name = inputs.customStateRate > 0 ? 'Other (Custom)' : 'No State Tax';

                const data = {
                    years: [],
                    traditionalIRA: [],
                    rothIRA: [],
                    traditionalAfterTax: [],
                    noConvIraAfterTax: [],
                    noConvRmdReinvest: [],
                    convRemainingAfterTax: [],
                    rothNetBenefit: [],
                    netAdvantage: [],
                    conversionTaxes: [],
                    federalTaxes: [],
                    stateTaxes: [],
                    cumulativeConversions: [],
                    rmdAmounts: [],
                    doNothingTaxByYear: [],
                    rothTaxByYear: [],
                    magiByYear: [],
                    irmaaTierByYear: [],
                    marginalRates: [],
                    opportunityCost: [],
                    opportunityGrowth: [],
                    breakEvenPoints: [],
                    discountedConversions: [],
                    effectiveDiscountRates: [],
                    inputs
                };

                // Conversion (Roth) track
                let traditionalBalance = inputs.iraBalance;   // IRA remaining after conversions
                let rothBalance = 0;
                let convSide = 0;                             // after-tax RMDs reinvested in taxable
                let convSideBasis = 0;
                let opportunityCost = 0;                      // taxes paid from outside, invested instead
                let opportunityCostBasis = 0;

                // No-conversion (do-nothing) baseline track — same starting dollars, never converted
                let noConvBalance = inputs.iraBalance;
                let noConvSide = 0;                           // after-tax RMDs reinvested in taxable
                let noConvSideBasis = 0;

                let displayCumulativeConversions = 0;
                let displayCumulativeTaxes = 0;
                let displayDiscountBenefit = 0;

                // Lifetime ordinary-income tax accumulators, present-valued at the chosen discount
                // rate (RMD taxes along the way + the income tax to liquidate the IRA at the horizon).
                let pvDoNothingTax = 0;
                let pvRothTax = 0;

                // Cumulative Medicare IRMAA surcharges (today's-dollar terms) for each path, plus the
                // MAGI history each path generates (used for the 2-year IRMAA lookback).
                let cumIrmaaDoNothing = 0;
                let cumIrmaaConv = 0;
                const magiDoNothingHistory = [];
                const magiConvHistory = [];

                const analysisYears = normalizeAnalysisYear(inputs.analysisYear);

                for (let year = 0; year <= analysisYears; year++) {
                    const age = inputs.currentAge + year;
                    const isRetired = age >= inputs.retirementAge;

                    // Widow(er) penalty: after the first spouse passes, the survivor files Single, which
                    // compresses brackets and lifts the retirement rate (a strong case for converting).
                    const widowed = inputs.filingStatus === 'mfj' && inputs.modelSurvivor && age >= inputs.survivorAge;
                    setFilingStatus(widowed ? 'single' : inputs.filingStatus);
                    const returnRate = isRetired ? inputs.postRetirementReturn : inputs.preRetirementReturn;
                    const annualIncome = inputs.currentIncome * Math.pow(1 + inputs.incomeGrowthRate, Math.min(year, inputs.retirementAge - inputs.currentAge));

                    // Apply investment returns to every balance in both tracks
                    if (year > 0) {
                        traditionalBalance *= (1 + returnRate);
                        rothBalance *= (1 + returnRate);
                        convSide *= (1 + returnRate);
                        opportunityCost *= (1 + inputs.taxableAccountReturn);
                        noConvBalance *= (1 + returnRate);
                        noConvSide *= (1 + returnRate);
                    }

                    // Process conversions with potential asset discounting
                    const conversionThisYear = inputs.conversions.find(c => c.year === year);
                    let conversionAmount = conversionThisYear ? Math.min(traditionalBalance, conversionThisYear.amount) : 0;
                    let discountedConversionValue = conversionAmount;
                    let effectiveDiscountRate = 0;

                    // Apply asset discount if enabled
                    if (conversionAmount > 0 && inputs.enableAssetDiscount) {
                        if (inputs.discountStrategy === 'conversion') {
                            // Apply discount only to conversion amount
                            discountedConversionValue = calculateAssetDiscount(conversionAmount, inputs);
                        } else {
                            // Apply discount to entire IRA balance, then take conversion portion
                            const discountedBalance = calculateAssetDiscount(traditionalBalance, inputs);
                            const discountRatio = discountedBalance / traditionalBalance;
                            discountedConversionValue = conversionAmount * discountRatio;
                        }

                        const discountBenefit = conversionAmount - discountedConversionValue;

                        effectiveDiscountRate = calculateEffectiveDiscountRate(conversionAmount, discountedConversionValue);
                        displayDiscountBenefit += getDisplayValue(discountBenefit, year, inputs);
                    }

                    let federalTax = 0;
                    let stateTax = 0;
                    let totalTax = 0;
                    let marginalRate = 0;

                    if (conversionAmount > 0) {
                        // Calculate taxes based on discounted conversion value
                        const incomeWithConversion = annualIncome + discountedConversionValue;
                        const incomeWithoutConversion = annualIncome;

                        // OBBBA senior bonus deduction (2025–2028, age 65+). The conversion raises MAGI,
                        // which can erode the deduction, so each scenario uses its own phased amount.
                        const calendarYear = projectionBaseYear + year;
                        const seniorDeductionWith = getSeniorBonusDeduction(incomeWithConversion, age, calendarYear);
                        const seniorDeductionWithout = getSeniorBonusDeduction(incomeWithoutConversion, age, calendarYear);

                        federalTax = calculateFederalTax(incomeWithConversion, seniorDeductionWith) - calculateFederalTax(incomeWithoutConversion, seniorDeductionWithout);
                        // A conversion is taxed in the state of residence for that year — the working
                        // state before retirement, the (possibly different) retirement state after.
                        const yearState = age >= inputs.retirementAge ? inputs.retirementState : inputs.stateResidency;
                        stateTax = calculateStateTax(incomeWithConversion, yearState) - calculateStateTax(incomeWithoutConversion, yearState);
                        totalTax = federalTax + stateTax;

                        marginalRate = calculateMarginalFederalTaxRate(incomeWithConversion) + calculateMarginalStateTaxRate(incomeWithConversion, yearState);

                        // Track actual IRA amounts converted and taxes paid in display terms
                        displayCumulativeConversions += getDisplayValue(conversionAmount, year, inputs);
                        displayCumulativeTaxes += getDisplayValue(totalTax, year, inputs);

                        // Split the conversion tax between outside funds (invested in a taxable
                        // account) and tax withheld from the conversion itself, per the outside-funds %.
                        const outsidePortion = totalTax * inputs.outsideFundsPct;
                        const iraPortion = totalTax - outsidePortion;
                        opportunityCost += outsidePortion;
                        opportunityCostBasis += outsidePortion;

                        // The full conversion leaves the traditional IRA; the IRA-funded tax is
                        // withheld from it, so only the net amount lands in the Roth.
                        traditionalBalance -= conversionAmount;
                        rothBalance += (conversionAmount - iraPortion);
                    }

                    // Required minimum distributions — forced, taxed, and reinvested after-tax in a
                    // taxable account in BOTH tracks so each strategy keeps the same money fairly.
                    const rmdFactor = rmdFactors[age] || 6.4;

                    // Effective retirement tax rates (blended drawdown) for each track's IRA balance.
                    // Only feed an actual RMD once at/after RMD age; before then there is no RMD, so
                    // pass 0 and let getEffectiveRetirementRate use its 4%-of-balance representative
                    // withdrawal (rmdFactors defaults to 6.4 for ages < 73, which would otherwise
                    // overstate the withdrawal and inflate the estimated rate).
                    const atRmdAge = age >= inputs.rmdAge;
                    const convRetireRate = getEffectiveRetirementRate(traditionalBalance, (atRmdAge && traditionalBalance > 0) ? traditionalBalance / rmdFactor : 0, inputs);
                    const noConvRetireRate = getEffectiveRetirementRate(noConvBalance, (atRmdAge && noConvBalance > 0) ? noConvBalance / rmdFactor : 0, inputs);

                    let rmd = 0;            // no-conversion (do-nothing) RMD — the schedule conversions aim to shrink
                    if (age >= inputs.rmdAge && noConvBalance > 0) {
                        rmd = noConvBalance / rmdFactor;
                        noConvBalance -= rmd;
                        const afterTaxRmd = rmd * (1 - noConvRetireRate);
                        noConvSide += afterTaxRmd;
                        noConvSideBasis += afterTaxRmd;
                    }

                    let convRmd = 0;        // RMD on the (smaller) post-conversion balance
                    if (age >= inputs.rmdAge && traditionalBalance > 0) {
                        convRmd = traditionalBalance / rmdFactor;
                        traditionalBalance -= convRmd;
                        const afterTaxRmd = convRmd * (1 - convRetireRate);
                        convSide += afterTaxRmd;
                        convSideBasis += afterTaxRmd;
                    }

                    // Annual ordinary-income taxes for each path (nominal): RMD taxes every year,
                    // plus the income tax to liquidate the remaining IRA in the final year. The Roth
                    // path also pays the conversion tax (totalTax) in conversion years.
                    const isFinalYear = year === analysisYears;
                    // SECURE Act 10-year rule: non-spouse heirs must drain an inherited Traditional IRA
                    // within 10 years, often at a higher rate than the owner's. When modeled, the final
                    // (legacy) liquidation of the remaining IRA uses the heir's rate instead.
                    const iraRateDN = (isFinalYear && inputs.modelHeir) ? inputs.heirTaxRate : noConvRetireRate;
                    const iraRateC = (isFinalYear && inputs.modelHeir) ? inputs.heirTaxRate : convRetireRate;
                    const doNothingTaxNominal = rmd * noConvRetireRate + (isFinalYear ? noConvBalance * iraRateDN : 0);
                    const rothTaxNominal = totalTax + convRmd * convRetireRate + (isFinalYear ? traditionalBalance * iraRateC : 0);
                    const pvFactor = Math.pow(1 + inputs.discountRate, year);
                    pvDoNothingTax += doNothingTaxNominal / pvFactor;
                    pvRothTax += rothTaxNominal / pvFactor;

                    // Each path's ordinary (non-gain) income this year — shared by NIIT and IRMAA.
                    const workingIncome = age < inputs.retirementAge ? annualIncome : 0;
                    const otherRet = age >= inputs.retirementAge ? (inputs.otherRetirementIncome || 0) : 0;
                    const ssDN = (inputs.includeSocialSecurity && age >= inputs.retirementAge) ? taxableSocialSecurity(inputs.socialSecurityBenefit, workingIncome + rmd + otherRet) : 0;
                    const ssC = (inputs.includeSocialSecurity && age >= inputs.retirementAge) ? taxableSocialSecurity(inputs.socialSecurityBenefit, workingIncome + convRmd + otherRet + discountedConversionValue) : 0;
                    const doNothingMAGI = workingIncome + rmd + otherRet + ssDN;
                    const convMAGI = workingIncome + discountedConversionValue + convRmd + otherRet + ssC;

                    // After-tax value of a taxable account, with the 3.8% NIIT applied to the LESSER of
                    // the realized gain or the MAGI above the threshold (the actual rule — no cliff that
                    // taxes the entire gain the moment MAGI ticks $1 over the line). The do-nothing path
                    // holds larger taxable accounts (bigger RMDs + the invested tax dollars), so NIIT
                    // modestly favors converting (the Roth shelters those gains).
                    const afterTaxWithNIIT = (value, basis, baseMAGI) => {
                        const gain = Math.max(0, value - basis);
                        if (gain <= 0) return value;
                        // Step-up in basis at death: the final-year (death) liquidation escapes capital
                        // gains tax entirely for taxable accounts (the heir inherits a stepped-up basis).
                        if (inputs.stepUpAtDeath && isFinalYear) return value;
                        const ordinaryTaxable = Math.max(0, baseMAGI - federalStandardDeduction);
                        const capGainsTax = inputs.progressiveCapGains
                            ? progressiveLTCG(gain, ordinaryTaxable)
                            : gain * inputs.capitalGainsRate;
                        const niitGain = inputs.enableNIIT ? Math.min(gain, Math.max(0, baseMAGI + gain - activeFiling.niitThreshold)) : 0;
                        return value - (capGainsTax + niitGain * 0.038);
                    };

                    // After-tax wealth of each whole-portfolio strategy at this point in time.
                    // The do-nothing path holds TWO taxable accounts (invested tax dollars + reinvested
                    // RMDs) for the same filer, so their gains must stack for progressive LTCG/NIIT.
                    // Tax the combined balance, then split the tax pro-rata by gain for the display.
                    const dnTaxableValue = opportunityCost + noConvSide;
                    const dnTaxableBasis = opportunityCostBasis + noConvSideBasis;
                    const dnTaxableAfterTax = afterTaxWithNIIT(dnTaxableValue, dnTaxableBasis, doNothingMAGI);
                    const dnTaxableTax = dnTaxableValue - dnTaxableAfterTax;
                    const gainOpp = Math.max(0, opportunityCost - opportunityCostBasis);
                    const gainSide = Math.max(0, noConvSide - noConvSideBasis);
                    const dnGainTotal = gainOpp + gainSide;
                    const afterTaxOpportunityCost = opportunityCost - (dnGainTotal > 0 ? dnTaxableTax * gainOpp / dnGainTotal : 0);
                    const noConvSideAfterTax = noConvSide - (dnGainTotal > 0 ? dnTaxableTax * gainSide / dnGainTotal : 0);
                    const convSideAfterTax = afterTaxWithNIIT(convSide, convSideBasis, convMAGI);

                    // No-conversion baseline: full IRA taxed at retirement (heir's rate in the final
                    // legacy year) + reinvested RMDs + the tax dollars left invested in a taxable account.
                    const noConvIraAfterTax = noConvBalance * (1 - iraRateDN);
                    const noConversionWealth = noConvIraAfterTax + noConvSideAfterTax + afterTaxOpportunityCost;

                    // Conversion strategy: tax-free Roth + after-tax value of any unconverted IRA + RMDs.
                    const convRemainingAfterTax = traditionalBalance * (1 - iraRateC) + convSideAfterTax;
                    const conversionWealth = rothBalance + convRemainingAfterTax;

                    // Medicare IRMAA: surcharges are paid starting at age 65, set by MAGI from 2 years
                    // prior (the lookback). Conversions raise MAGI now but shrink later RMDs, so each
                    // path's surcharge is computed on its own income and netted out of its wealth.
                    if (inputs.enableIRMAA) {
                        magiDoNothingHistory.push(doNothingMAGI);
                        magiConvHistory.push(convMAGI);

                        if (age >= 65) {
                            const lb = year - 2;
                            // Before the 2-year history exists (first two years), fall back to the
                            // baseline first-year do-nothing MAGI for both paths, so a year-0 conversion
                            // doesn't trigger its own IRMAA immediately (it surfaces 2 years later).
                            const dnMAGI = lb >= 0 ? magiDoNothingHistory[lb] : magiDoNothingHistory[0];
                            const cMAGI = lb >= 0 ? magiConvHistory[lb] : magiDoNothingHistory[0];
                            cumIrmaaDoNothing += getDisplayValue(irmaaCost(dnMAGI), year, inputs);
                            cumIrmaaConv += getDisplayValue(irmaaCost(cMAGI), year, inputs);
                        }
                    }

                    const displayTraditionalBalance = getDisplayValue(noConvBalance, year, inputs);
                    const displayRothBalance = getDisplayValue(rothBalance, year, inputs);
                    const displayNoConversionWealth = getDisplayValue(noConversionWealth, year, inputs) - cumIrmaaDoNothing;
                    const displayConversionWealth = getDisplayValue(conversionWealth, year, inputs) - cumIrmaaConv;
                    const displayNoConvIraAfterTax = getDisplayValue(noConvIraAfterTax, year, inputs);
                    const displayConvRemainingAfterTax = getDisplayValue(convRemainingAfterTax, year, inputs);
                    const displayOpportunityCost = getDisplayValue(afterTaxOpportunityCost, year, inputs);
                    const displayRmd = getDisplayValue(rmd, year, inputs);
                    const displayFederalTax = getDisplayValue(federalTax, year, inputs);
                    const displayStateTax = getDisplayValue(stateTax, year, inputs);
                    const displayTotalTax = getDisplayValue(totalTax, year, inputs);
                    const displayDiscountedConversion = getDisplayValue(discountedConversionValue, year, inputs);

                    // Store data points
                    data.years.push(year);
                    data.traditionalIRA.push(displayTraditionalBalance);
                    data.rothIRA.push(displayRothBalance);
                    data.traditionalAfterTax.push(displayNoConversionWealth);
                    data.noConvIraAfterTax.push(displayNoConvIraAfterTax);
                    data.noConvRmdReinvest.push(getDisplayValue(noConvSideAfterTax, year, inputs));
                    data.convRemainingAfterTax.push(displayConvRemainingAfterTax);
                    data.opportunityCost.push(displayOpportunityCost);
                    data.rothNetBenefit.push(displayConversionWealth);
                    data.netAdvantage.push(displayConversionWealth - displayNoConversionWealth);
                    data.federalTaxes[year] = displayFederalTax;
                    data.stateTaxes[year] = displayStateTax;
                    data.conversionTaxes[year] = displayTotalTax;
                    data.cumulativeConversions[year] = displayCumulativeConversions;
                    data.rmdAmounts[year] = displayRmd;
                    data.doNothingTaxByYear[year] = getDisplayValue(doNothingTaxNominal, year, inputs);
                    data.rothTaxByYear[year] = getDisplayValue(rothTaxNominal, year, inputs);
                    data.magiByYear[year] = getDisplayValue(convMAGI, year, inputs);
                    data.irmaaTierByYear[year] = irmaaTier(convMAGI);
                    data.marginalRates[year] = marginalRate;
                    data.discountedConversions[year] = displayDiscountedConversion;
                    data.effectiveDiscountRates[year] = effectiveDiscountRate;
                    data.opportunityGrowth[year] = displayOpportunityCost > 0 && displayCumulativeTaxes > 0 ? (displayOpportunityCost / displayCumulativeTaxes - 1) : 0;
                }

                // Restore the base filing status for any post-loop / chart computations.
                setFilingStatus(inputs.filingStatus);

                // Calculate summary metrics
                data.breakEvenYear = data.netAdvantage.findIndex(adv => adv > 0);
                data.totalAdvantage = data.netAdvantage[analysisYears];
                data.totalTaxesPaid = displayCumulativeTaxes;
                data.finalOpportunityCost = data.opportunityCost[analysisYears];
                data.opportunityReturn = data.finalOpportunityCost > 0 && displayCumulativeTaxes > 0 ? Math.pow(data.finalOpportunityCost / displayCumulativeTaxes, 1 / analysisYears) - 1 : 0;
                data.totalDiscountBenefit = displayDiscountBenefit;
                data.effectiveTaxSavings = displayDiscountBenefit > 0 ? (displayDiscountBenefit * (data.marginalRates.find(r => r > 0) || 0.24)) : 0;

                // Lifetime ordinary-income tax comparison, present-valued at the discount rate:
                //   Do-nothing = RMD taxes + tax to liquidate the remaining IRA at the horizon.
                //   Roth path  = conversion taxes now + RMD/liquidation taxes on any unconverted IRA.
                data.doNothingLifetimeTax = pvDoNothingTax;
                data.rothLifetimeTax = pvRothTax;
                data.lifetimeTaxSavings = data.doNothingLifetimeTax - data.rothLifetimeTax;

                // Medicare IRMAA totals (today's dollars). Positive delta = conversions add surcharges.
                data.doNothingIrmaa = cumIrmaaDoNothing;
                data.conversionIrmaa = cumIrmaaConv;
                data.irmaaDelta = cumIrmaaConv - cumIrmaaDoNothing;

                return data;
            }

            // UI Enhancement functions
            function toggleUIElements() {
                const isMultiYear = document.getElementById('multiYearStrategy').checked;
                document.getElementById('conversionStrategyDiv').classList.toggle('hidden', !isMultiYear);
                const amountEl = document.getElementById('conversionStrategyDiv-amount');
                if (amountEl) amountEl.classList.toggle('hidden', !isMultiYear);
                document.getElementById('singleConversionDiv').classList.toggle('hidden', isMultiYear);
                document.getElementById('incomeGrowthRateGroup').classList.toggle('hidden', !isMultiYear);

                const strategy = document.getElementById('conversionStrategy').value;
                document.getElementById('maxBracketDiv').classList.toggle('hidden', strategy !== 'optimized' || !isMultiYear);

                document.getElementById('socialSecurityDiv').classList.toggle('hidden', !document.getElementById('includeSocialSecurity').checked);
                const relocate = document.getElementById('relocateInRetirement').checked;
                document.getElementById('retirementStateDiv').classList.toggle('hidden', !relocate);

                // Custom state rate shows when the current or retirement state is "Other".
                const usesOther = document.getElementById('stateResidency').value === 'other'
                    || (relocate && document.getElementById('retirementState').value === 'other');
                document.getElementById('customStateDiv').classList.toggle('hidden', !usesOther);

                // Survivor age only matters for joint filers; heir rate when legacy value is modeled.
                const survivorOn = document.getElementById('modelSurvivor').checked && document.getElementById('filingStatus').value === 'mfj';
                document.getElementById('survivorDiv').classList.toggle('hidden', !survivorOn);
                document.getElementById('heirDiv').classList.toggle('hidden', !document.getElementById('modelHeir').checked);

                const enableDiscount = document.getElementById('enableAssetDiscount').checked;
                document.getElementById('assetDiscountDiv').classList.toggle('hidden', !enableDiscount);
            }

            function updateKeyMetrics() {
                const { totalAdvantage, breakEvenYear, totalTaxesPaid, rothNetBenefit, traditionalAfterTax, finalOpportunityCost, opportunityReturn, totalDiscountBenefit, effectiveTaxSavings } = analysisData;
                const finalYear = analysisData.years.length - 1;

                // Calculate ROI on conversions
                const conversionROI = totalTaxesPaid > 0 ? ((totalAdvantage / totalTaxesPaid) * 100) : 0;

                let metricsHTML = `
                    <div class="metric-card">
                        <div class="metric-value ${totalAdvantage >= 0 ? 'positive' : 'negative'}">${formatCurrency(totalAdvantage)}</div>
                        <div class="metric-label">Net Advantage at Year ${finalYear}</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value">${breakEvenYear >= 0 ? `Year ${breakEvenYear}` : 'Beyond Analysis'}</div>
                        <div class="metric-label">Break-Even Point</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value">${formatCurrency(totalTaxesPaid)}</div>
                        <div class="metric-label">Total Conversion Taxes</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value">${formatPercent(conversionROI / 100)}</div>
                        <div class="metric-label">Conversion ROI</div>
                    </div>
                `;

                // Add discount-specific metrics if enabled
                if (analysisData.inputs.enableAssetDiscount && totalDiscountBenefit > 0) {
                    const effectiveDiscountRate = calculateEffectiveDiscountRate(analysisData.inputs.totalConversionAmount || analysisData.inputs.conversionAmount, (analysisData.inputs.totalConversionAmount || analysisData.inputs.conversionAmount) - totalDiscountBenefit);

                    metricsHTML += `
                        <div class="metric-card" style="border-color: var(--warning-color);">
                            <div class="metric-value" style="color: var(--warning-color);">${formatPercent(effectiveDiscountRate)}</div>
                            <div class="metric-label">Effective Discount Rate</div>
                        </div>
                        <div class="metric-card" style="border-color: var(--success-color);">
                            <div class="metric-value" style="color: var(--success-color);">${formatCurrency(effectiveTaxSavings)}</div>
                            <div class="metric-label">Tax Savings from Discount</div>
                        </div>
                    `;
                }
                // Four tiles by default (matches the editorial reference); opportunity cost is
                // surfaced in its own section below.

                document.getElementById('keyMetrics').innerHTML = metricsHTML;
            }

            function updateStrategySummary() {
                const finalYear = analysisData.years.length - 1;

                // Traditional (do-nothing) card — after-tax components that sum to the Final Value:
                //   remaining IRA after-tax + reinvested RMDs (taxable) + invested tax dollars (taxable)
                document.getElementById('tradPreTaxValue').textContent = formatCurrency(analysisData.noConvIraAfterTax[finalYear]);
                document.getElementById('tradRmdsValue').textContent = formatCurrency(analysisData.noConvRmdReinvest[finalYear]);
                document.getElementById('tradTaxesValue').textContent = formatCurrency(analysisData.opportunityCost[finalYear]);
                document.getElementById('tradFinalValue').textContent = formatCurrency(analysisData.traditionalAfterTax[finalYear]);

                // Roth conversion card — tax-free Roth + remaining IRA & reinvested RMDs (after-tax)
                document.getElementById('rothBalanceValue').textContent = formatCurrency(analysisData.rothIRA[finalYear]);
                document.getElementById('rothOppCostValue').textContent = formatCurrency(analysisData.convRemainingAfterTax[finalYear]);
                document.getElementById('rothTaxesPaidValue').textContent = formatCurrency(analysisData.totalTaxesPaid);
                document.getElementById('rothFinalValue').textContent = formatCurrency(analysisData.rothNetBenefit[finalYear]);
            }

            // ---- Saved scenarios (localStorage) ----
            function escapeHtml(s) {
                return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
            }
            function persistScenarios() {
                try { localStorage.setItem('awmRothScenarios', JSON.stringify(savedScenarios)); } catch (e) { /* ignore quota */ }
            }
            function captureScenarioSnapshot() {
                const snap = {};
                document.querySelectorAll('.controls-well input[id], .controls-well select[id], #stateResidency, #analysisYear').forEach(el => {
                    snap[el.id] = el.type === 'checkbox' ? el.checked : el.value;
                });
                return snap;
            }
            function currentScenarioMetrics() {
                const d = analysisData, f = d.years.length - 1;
                return {
                    netAdv: Math.round(d.netAdvantage[f]),
                    breakEven: d.breakEvenYear,
                    taxes: Math.round(d.totalTaxesPaid),
                    lifetimeSaved: Math.round(d.lifetimeTaxSavings || 0),
                    rothFinal: Math.round(d.rothNetBenefit[f]),
                    doNothingFinal: Math.round(d.traditionalAfterTax[f]),
                    filing: d.inputs.filingStatus
                };
            }
            function saveCurrentScenario() {
                if (!analysisData.years) return;
                const nameEl = document.getElementById('scenarioName');
                const name = (nameEl.value || '').trim() || `Scenario ${savedScenarios.length + 1}`;
                savedScenarios.push({ id: 'sc' + Date.now(), name, snapshot: captureScenarioSnapshot(), metrics: currentScenarioMetrics() });
                persistScenarios();
                nameEl.value = '';
                renderScenarios();
            }
            function loadScenario(id) {
                const s = savedScenarios.find(x => x.id === id);
                if (!s) return;
                Object.entries(s.snapshot).forEach(([k, v]) => {
                    const el = document.getElementById(k);
                    if (el) { if (el.type === 'checkbox') el.checked = v; else el.value = v; }
                });
                calculateAndDisplay();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
            function deleteScenario(id) {
                savedScenarios = savedScenarios.filter(x => x.id !== id);
                persistScenarios();
                renderScenarios();
            }
            function renderScenarios() {
                const wrap = document.getElementById('scenariosCompare');
                if (!wrap) return;
                if (!savedScenarios.length) {
                    wrap.innerHTML = '<p class="scenario-empty">No saved scenarios yet — adjust the inputs and click “Save Current” to compare strategies side by side.</p>';
                    return;
                }
                const signed = v => (v >= 0 ? '+' : '−') + formatCurrency(Math.abs(v));
                const rows = [
                    ['Net Advantage', s => `<span class="${s.metrics.netAdv >= 0 ? 'positive' : 'negative'}">${signed(s.metrics.netAdv)}</span>`],
                    ['Break-Even', s => s.metrics.breakEven >= 0 ? `Year ${s.metrics.breakEven}` : 'Beyond'],
                    ['Roth Strategy (after-tax)', s => formatCurrency(s.metrics.rothFinal)],
                    ['Do Nothing (after-tax)', s => formatCurrency(s.metrics.doNothingFinal)],
                    ['Total Conversion Taxes', s => formatCurrency(s.metrics.taxes)],
                    ['Lifetime Tax Saved', s => formatCurrency(s.metrics.lifetimeSaved)],
                    ['Filing', s => s.metrics.filing === 'mfj' ? 'MFJ' : 'Single']
                ];
                let html = '<div style="overflow-x:auto"><table class="scenario-table"><thead><tr><th>Metric</th>';
                savedScenarios.forEach(s => {
                    html += `<th>${escapeHtml(s.name)}<div class="scenario-actions"><button class="scenario-mini-btn" data-load="${s.id}">Load</button><button class="scenario-mini-btn" data-del="${s.id}">Remove</button></div></th>`;
                });
                html += '</tr></thead><tbody>';
                rows.forEach(([label, fn]) => {
                    html += `<tr><td>${label}</td>` + savedScenarios.map(s => `<td>${fn(s)}</td>`).join('') + '</tr>';
                });
                html += '</tbody></table></div>';
                wrap.innerHTML = html;
                wrap.querySelectorAll('[data-load]').forEach(btn => btn.addEventListener('click', () => loadScenario(btn.dataset.load)));
                wrap.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', () => deleteScenario(btn.dataset.del)));
            }

            function updateTaxComparison() {
                const el = document.getElementById('taxComparison');
                if (!el || !analysisData) return;
                const { doNothingLifetimeTax, rothLifetimeTax, lifetimeTaxSavings } = analysisData;
                const saves = lifetimeTaxSavings >= 0;
                const discLabel = `PV @ ${formatPercent(analysisData.inputs.discountRate)}`;
                el.innerHTML = `
                    <div class="cost-item">
                        <div class="cost-item-value">${formatCurrency(doNothingLifetimeTax)}</div>
                        <div class="cost-item-label">Do-Nothing IRA Taxes (${discLabel})</div>
                    </div>
                    <div class="cost-item">
                        <div class="cost-item-value">${formatCurrency(rothLifetimeTax)}</div>
                        <div class="cost-item-label">Roth Strategy Taxes (${discLabel})</div>
                    </div>
                    <div class="cost-item">
                        <div class="cost-item-value" style="color: ${saves ? 'var(--accent-color)' : 'var(--error-color)'};">${formatCurrency(Math.abs(lifetimeTaxSavings))}</div>
                        <div class="cost-item-label">${saves ? 'Lifetime Tax Saved' : 'Additional Lifetime Tax'}</div>
                    </div>
                `;
                const cap = document.getElementById('taxesOverTimeCaption');
                if (cap) {
                    const dollarsLabel = analysisData.inputs.adjustForInflation ? "today's dollars" : "nominal dollars";
                    cap.innerHTML = `Annual ordinary-income taxes by year (${dollarsLabel}). The <span class="coral">Roth</span> path front-loads tax during the conversion window; the do-nothing path back-loads it as RMDs and the final withdrawal. Present value applies a ${formatPercent(analysisData.inputs.discountRate)} discount rate, which is why timing matters.`;
                }
            }

            function updateOpportunityCostBreakdown() {
                const { totalTaxesPaid, finalOpportunityCost, opportunityReturn, totalAdvantage, totalDiscountBenefit, effectiveTaxSavings } = analysisData;
                const taxPaymentYears = analysisData.inputs.isMultiYear ? analysisData.inputs.conversionYears : 1;
                const avgAnnualTax = totalTaxesPaid / taxPaymentYears;
                const effectiveReturn = opportunityReturn * 100;
                const projectionLabel = analysisData.inputs.adjustForInflation ? ' (Today\'s Dollars)' : '';

                let breakdownHTML = `
                    <div class="cost-item">
                        <div class="cost-item-value">${formatCurrency(totalTaxesPaid)}</div>
                        <div class="cost-item-label">Total Tax Payments${projectionLabel}</div>
                    </div>
                    <div class="cost-item">
                        <div class="cost-item-value">${formatCurrency(avgAnnualTax)}</div>
                        <div class="cost-item-label">Avg. Annual Tax Payment${projectionLabel}</div>
                    </div>
                    <div class="cost-item">
                        <div class="cost-item-value">${formatPercent(effectiveReturn / 100)}</div>
                        <div class="cost-item-label">Opportunity Cost Return</div>
                    </div>
                `;

                // Add discount-specific breakdown if enabled
                if (analysisData.inputs.enableAssetDiscount && totalDiscountBenefit > 0) {
                    const originalConversionValue = (analysisData.inputs.totalConversionAmount || analysisData.inputs.conversionAmount);
                    const discountedValue = originalConversionValue - totalDiscountBenefit;
                    const effectiveDiscountRate = calculateEffectiveDiscountRate(originalConversionValue, discountedValue);

                    breakdownHTML += `
                        <div class="cost-item" style="border-color: var(--warning-color);">
                            <div class="cost-item-value" style="color: var(--warning-color);">${formatCurrency(originalConversionValue)}</div>
                            <div class="cost-item-label">Original Conversion Value</div>
                        </div>
                        <div class="cost-item" style="border-color: var(--warning-color);">
                            <div class="cost-item-value" style="color: var(--warning-color);">${formatCurrency(discountedValue)}</div>
                            <div class="cost-item-label">Discounted Conversion Value</div>
                        </div>
                        <div class="cost-item" style="border-color: var(--success-color);">
                            <div class="cost-item-value" style="color: var(--success-color);">${formatCurrency(effectiveTaxSavings)}</div>
                            <div class="cost-item-label">Tax Savings from Discount</div>
                        </div>
                    `;
                } else {
                    breakdownHTML += `
                        <div class="cost-item">
                            <div class="cost-item-value">${formatCurrency(finalOpportunityCost)}</div>
                            <div class="cost-item-label">Final Opportunity Cost${projectionLabel}</div>
                        </div>
                    `;
                }

                breakdownHTML += `
                    <div class="cost-item">
                        <div class="cost-item-value ${totalAdvantage >= 0 ? 'positive' : 'negative'}" style="color: ${totalAdvantage >= 0 ? 'var(--accent-color)' : 'var(--error-color)'};">${formatCurrency(Math.abs(totalAdvantage))}</div>
                        <div class="cost-item-label">${totalAdvantage >= 0 ? 'Net Benefit' : 'Net Cost'}</div>
                    </div>
                `;

                document.getElementById('opportunityCostBreakdown').innerHTML = breakdownHTML;
            }

            function createOrUpdateChart(id, config) {
                try {
                    const ctx = document.getElementById(id);
                    if (!ctx) {
                        console.error('Chart canvas not found:', id);
                        return;
                    }

                    if (typeof Chart === 'undefined') {
                        console.error('Chart.js not loaded');
                        return;
                    }

                    const chartCtx = ctx.getContext('2d');
                    if (charts[id]) {
                        charts[id].destroy();
                    }
                    charts[id] = new Chart(chartCtx, config);
                } catch (error) {
                    console.error('Error creating chart:', id, error);
                }
            }

            function createComparisonChart() {
                const labels = analysisData.years.map(year => `Age ${analysisData.inputs.currentAge + year}`);
                createOrUpdateChart('comparisonChart', {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [
                            {
                                label: 'Roth Conversion (after-tax)',
                                data: analysisData.rothNetBenefit,
                                borderColor: CHART_COLORS.coral,
                                backgroundColor: 'rgba(192, 86, 42, 0.08)',
                                borderWidth: 2.5,
                                fill: false,
                                pointRadius: 0,
                                activeDot: { r: 5 },
                                tension: 0.1
                            },
                            {
                                label: 'Do Nothing (after-tax)',
                                data: analysisData.traditionalAfterTax,
                                borderColor: CHART_COLORS.ocean,
                                backgroundColor: 'rgba(47, 111, 143, 0.08)',
                                borderWidth: 2,
                                borderDash: [5, 4],
                                fill: false,
                                pointRadius: 0,
                                tension: 0.1
                            },
                            {
                                label: 'Net Advantage',
                                data: analysisData.netAdvantage,
                                borderColor: CHART_COLORS.inkFaint,
                                backgroundColor: 'rgba(30, 42, 74, 0.05)',
                                borderWidth: 1.5,
                                borderDash: [2, 3],
                                fill: false,
                                pointRadius: 0,
                                tension: 0.1
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            tooltip: {
                                backgroundColor: '#faf6ec',
                                titleColor: '#1e2a4a',
                                bodyColor: '#1e2a4a',
                                borderColor: 'rgba(30, 42, 74, 0.15)',
                                borderWidth: 1,
                                callbacks: {
                                    label: function (context) {
                                        return `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`;
                                    }
                                }
                            },
                            legend: {
                                position: 'top',
                                labels: {
                                    usePointStyle: true,
                                    padding: 15
                                }
                            }
                        },
                        scales: {
                            x: {
                                ticks: {
                                    callback: function (value, index, ticks) {
                                        const year = analysisData.years[index];
                                        if (year % 5 === 0 || index === ticks.length - 1) {
                                            return this.getLabelForValue(value);
                                        }
                                        return '';
                                    },
                                    autoSkip: false,
                                    maxRotation: 0,
                                    minRotation: 0
                                },
                                grid: {
                                    color: 'rgba(30, 42, 74, 0.08)'
                                }
                            },
                            y: {
                                ticks: {
                                    callback: function (value) {
                                        return formatCurrency(value);
                                    }
                                },
                                grid: {
                                    color: 'rgba(30, 42, 74, 0.08)'
                                }
                            }
                        }
                    }
                });
            }

            function createOpportunityChart() {
                const labels = analysisData.years.map(year => `Age ${analysisData.inputs.currentAge + year}`);
                createOrUpdateChart('opportunityCostChart', {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [
                            {
                                label: 'Roth IRA Balance',
                                data: analysisData.rothIRA,
                                borderColor: '#1e2a4a',
                                backgroundColor: 'rgba(30, 42, 74, 0.1)',
                                borderWidth: 3,
                                fill: false,
                                pointRadius: 0
                            },
                            {
                                label: 'Opportunity Cost',
                                data: analysisData.opportunityCost,
                                borderColor: '#c0562a',
                                backgroundColor: 'rgba(192, 86, 42, 0.1)',
                                borderWidth: 2,
                                fill: false,
                                pointRadius: 0
                            },
                            {
                                label: 'Roth Net Value',
                                data: analysisData.rothNetBenefit,
                                borderColor: '#2f6f8f',
                                backgroundColor: 'rgba(47, 111, 143, 0.1)',
                                borderWidth: 2,
                                fill: true,
                                pointRadius: 0
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            tooltip: {
                                callbacks: {
                                    label: function (context) {
                                        return `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`;
                                    }
                                }
                            }
                        },
                        scales: {
                            x: {
                                ticks: {
                                    callback: function (value, index, ticks) {
                                        const year = analysisData.years[index];
                                        if (year % 5 === 0 || index === ticks.length - 1) {
                                            return this.getLabelForValue(value);
                                        }
                                        return '';
                                    },
                                    autoSkip: false
                                }
                            },
                            y: {
                                ticks: {
                                    callback: function (value) {
                                        return formatCurrency(value);
                                    }
                                }
                            }
                        }
                    }
                });

                // Break-even analysis chart
                const breakEvenData = analysisData.netAdvantage.map((adv, index) => ({
                    year: index,
                    advantage: adv,
                    isPositive: adv > 0
                }));

                createOrUpdateChart('breakEvenChart', {
                    type: 'bar',
                    data: {
                        labels: analysisData.years.map(year => `Year ${year}`),
                        datasets: [{
                            label: 'Net Advantage',
                            data: analysisData.netAdvantage,
                            backgroundColor: analysisData.netAdvantage.map(adv => adv >= 0 ? 'rgba(47, 111, 143, 0.7)' : 'rgba(184, 68, 47, 0.7)'),
                            borderColor: analysisData.netAdvantage.map(adv => adv >= 0 ? '#2f6f8f' : '#b8442f'),
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            tooltip: {
                                callbacks: {
                                    label: function (context) {
                                        return `Net Advantage: ${formatCurrency(context.parsed.y)}`;
                                    }
                                }
                            }
                        },
                        scales: {
                            x: {
                                ticks: {
                                    callback: function (value, index) {
                                        return index % 5 === 0 ? this.getLabelForValue(value) : '';
                                    }
                                }
                            },
                            y: {
                                ticks: {
                                    callback: function (value) {
                                        return formatCurrency(value);
                                    }
                                }
                            }
                        }
                    }
                });
            }

            function createConversionChart() {
                const convYears = analysisData.inputs.conversionYears;
                const labels = Array.from({ length: convYears }, (_, i) => `Year ${i + 1} (Age ${analysisData.inputs.currentAge + i})`);

                createOrUpdateChart('conversionTimelineChart', {
                    type: 'bar',
                    data: {
                        labels,
                        datasets: [
                            {
                                label: 'Federal Tax',
                                data: analysisData.federalTaxes.slice(0, convYears),
                                backgroundColor: 'rgba(184, 68, 47, 0.8)',
                                borderColor: '#b8442f',
                                borderWidth: 1
                            },
                            {
                                label: 'State Tax',
                                data: analysisData.stateTaxes.slice(0, convYears),
                                backgroundColor: 'rgba(192, 86, 42, 0.8)',
                                borderColor: '#c0562a',
                                borderWidth: 1
                            },
                            {
                                label: 'Conversion Amount',
                                data: analysisData.inputs.conversions.map(c => c.amount),
                                backgroundColor: 'rgba(30, 42, 74, 0.3)',
                                borderColor: '#1e2a4a',
                                borderWidth: 1,
                                type: 'line',
                                yAxisID: 'y1'
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            tooltip: {
                                callbacks: {
                                    label: function (context) {
                                        return `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`;
                                    }
                                }
                            }
                        },
                        scales: {
                            x: { stacked: true },
                            y: {
                                stacked: true,
                                ticks: {
                                    callback: function (value) {
                                        return formatCurrency(value);
                                    }
                                },
                                title: {
                                    display: true,
                                    text: 'Tax Amount'
                                }
                            },
                            y1: {
                                type: 'linear',
                                display: true,
                                position: 'right',
                                ticks: {
                                    callback: function (value) {
                                        return formatCurrency(value);
                                    }
                                },
                                title: {
                                    display: true,
                                    text: 'Conversion Amount'
                                },
                                grid: {
                                    drawOnChartArea: false,
                                }
                            }
                        }
                    }
                });
            }

            function createAdvancedCharts() {
                // Enhanced Tax Bracket Chart
                const maxConv = Math.max(...(analysisData.inputs.conversions.map(c => c.amount) || [0]));
                const baseIncome = analysisData.inputs.currentIncome;
                // Reflect the OBBBA senior bonus deduction (age 65+, 2025–2028) in the bracket view;
                // the conversion raises MAGI, so each scenario uses its own phased amount.
                const seniorDed = getSeniorBonusDeduction(baseIncome, analysisData.inputs.currentAge, projectionBaseYear);
                const seniorDedWithConv = getSeniorBonusDeduction(baseIncome + maxConv, analysisData.inputs.currentAge, projectionBaseYear);
                const income = getFederalTaxableIncome(baseIncome, seniorDed);
                const incomeWithConv = getFederalTaxableIncome(baseIncome + maxConv, seniorDedWithConv);

                const bracketData = federalTaxBrackets.map(bracket => {
                    if (incomeWithConv < bracket.min) return 0;
                    return Math.min(incomeWithConv, bracket.max) - bracket.min;
                });

                createOrUpdateChart('taxBracketChart', {
                    type: 'bar',
                    data: {
                        labels: federalTaxBrackets.map(b => `${(b.rate * 100).toFixed(0)}%`),
                        datasets: [
                            {
                                label: 'Current Income',
                                data: federalTaxBrackets.map(bracket => {
                                    if (income < bracket.min) return 0;
                                    return Math.min(income, bracket.max) - bracket.min;
                                }),
                                backgroundColor: 'rgba(30, 42, 74, 0.5)',
                                borderColor: '#1e2a4a',
                                borderWidth: 1
                            },
                            {
                                label: 'Income + Conversion',
                                data: bracketData,
                                backgroundColor: 'rgba(192, 86, 42, 0.7)',
                                borderColor: '#c0562a',
                                borderWidth: 1
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            tooltip: {
                                callbacks: {
                                    label: function (context) {
                                        return `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`;
                                    }
                                }
                            }
                        },
                        scales: {
                            y: {
                                ticks: {
                                    callback: function (value) {
                                        return formatCurrency(value);
                                    }
                                }
                            }
                        }
                    }
                });

                // Enhanced Monte Carlo Simulation
                const mcResults = [];
                const numSimulations = 1000;

                for (let i = 0; i < numSimulations; i++) {
                    const variance = 0.3; // 30% variance
                    const variedInputs = {
                        ...analysisData.inputs,
                        preRetirementReturn: analysisData.inputs.preRetirementReturn * (1 + (Math.random() - 0.5) * variance),
                        postRetirementReturn: analysisData.inputs.postRetirementReturn * (1 + (Math.random() - 0.5) * variance),
                        currentIncome: analysisData.inputs.currentIncome * (1 + (Math.random() - 0.5) * 0.2)
                    };

                    variedInputs.conversions = getConversionAmounts(variedInputs);
                    const result = performCalculations(variedInputs);
                    mcResults.push(result.totalAdvantage);
                }

                mcResults.sort((a, b) => a - b);

                const percentiles = [10, 25, 50, 75, 90].map(p => {
                    const index = Math.floor((p / 100) * mcResults.length);
                    return mcResults[index];
                });

                createOrUpdateChart('monteCarloChart', {
                    type: 'bar',
                    data: {
                        labels: ['10th', '25th', '50th (Median)', '75th', '90th'],
                        datasets: [{
                            label: 'Net Advantage Distribution',
                            data: percentiles,
                            backgroundColor: percentiles.map(val => val >= 0 ? 'rgba(47, 111, 143, 0.7)' : 'rgba(184, 68, 47, 0.7)'),
                            borderColor: percentiles.map(val => val >= 0 ? '#2f6f8f' : '#b8442f'),
                            borderWidth: 2
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            tooltip: {
                                callbacks: {
                                    label: function (context) {
                                        return `${context.label} Percentile: ${formatCurrency(context.parsed.y)}`;
                                    }
                                }
                            }
                        },
                        scales: {
                            y: {
                                ticks: {
                                    callback: function (value) {
                                        return formatCurrency(value);
                                    }
                                }
                            }
                        }
                    }
                });

                // Enhanced Sensitivity Analysis
                const baseInputs = analysisData.inputs;
                const sensitivityTests = [
                    { name: 'Returns +3%', field: 'preRetirementReturn', change: 0.03 },
                    { name: 'Returns -3%', field: 'preRetirementReturn', change: -0.03 },
                    { name: 'Income +25%', field: 'currentIncome', change: baseInputs.currentIncome * 0.25 },
                    { name: 'Income -25%', field: 'currentIncome', change: -baseInputs.currentIncome * 0.25 },
                    { name: 'Tax Rates +5%', field: 'marginalTaxMultiplier', change: 0.05 },
                    { name: 'Earlier Retirement', field: 'retirementAge', change: -5 }
                ];

                const sensitivityResults = sensitivityTests.map(test => {
                    const testInputs = { ...baseInputs };
                    if (test.field === 'marginalTaxMultiplier') {
                        // Simulate higher tax environment
                        testInputs.preRetirementReturn *= 0.95; // Slightly lower returns due to higher taxes
                    } else {
                        testInputs[test.field] = (testInputs[test.field] || 0) + test.change;
                    }

                    testInputs.conversions = getConversionAmounts(testInputs);
                    const result = performCalculations(testInputs);
                    return { name: test.name, advantage: result.totalAdvantage };
                });

                createOrUpdateChart('sensitivityChart', {
                    type: 'bar',
                    data: {
                        labels: sensitivityResults.map(r => r.name),
                        datasets: [{
                            label: 'Net Advantage',
                            data: sensitivityResults.map(r => r.advantage),
                            backgroundColor: sensitivityResults.map(r =>
                                r.advantage > analysisData.totalAdvantage ? 'rgba(47, 111, 143, 0.7)' :
                                    r.advantage < 0 ? 'rgba(184, 68, 47, 0.7)' : 'rgba(192, 86, 42, 0.7)'
                            ),
                            borderColor: sensitivityResults.map(r =>
                                r.advantage > analysisData.totalAdvantage ? '#2f6f8f' :
                                    r.advantage < 0 ? '#b8442f' : '#c0562a'
                            ),
                            borderWidth: 2
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            tooltip: {
                                callbacks: {
                                    label: function (context) {
                                        const baseline = analysisData.totalAdvantage;
                                        const current = context.parsed.y;
                                        const diff = current - baseline;
                                        return [
                                            `Net Advantage: ${formatCurrency(current)}`,
                                            `vs. Baseline: ${diff >= 0 ? '+' : ''}${formatCurrency(diff)}`
                                        ];
                                    }
                                }
                            }
                        },
                        scales: {
                            y: {
                                ticks: {
                                    callback: function (value) {
                                        return formatCurrency(value);
                                    }
                                }
                            }
                        }
                    }
                });

                // Marginal vs Effective Tax Rates Chart
                const conversionYears = analysisData.inputs.conversionYears;
                const marginalTaxData = [];
                const effectiveTaxData = [];
                const incomeLabels = [];

                for (let i = 0; i < conversionYears; i++) {
                    const year = i;
                    const age = analysisData.inputs.currentAge + year;
                    const annualIncome = analysisData.inputs.currentIncome * Math.pow(1 + analysisData.inputs.incomeGrowthRate, year);
                    const conversion = analysisData.inputs.conversions.find(c => c.year === year);
                    const conversionAmount = conversion ? conversion.amount : 0;
                    const totalIncome = annualIncome + conversionAmount;

                    // Calculate marginal rate
                    const marginalFedRate = calculateMarginalFederalTaxRate(totalIncome);
                    const marginalStateRate = calculateMarginalStateTaxRate(totalIncome, analysisData.inputs.stateResidency);
                    const totalMarginalRate = marginalFedRate + marginalStateRate;

                    // Calculate effective rate
                    const totalTax = analysisData.conversionTaxes[year] || 0;
                    const effectiveRate = conversionAmount > 0 ? (totalTax / conversionAmount) : 0;

                    marginalTaxData.push(totalMarginalRate * 100);
                    effectiveTaxData.push(effectiveRate * 100);
                    incomeLabels.push(`Year ${i + 1} (Age ${age})`);
                }

                createOrUpdateChart('marginalTaxChart', {
                    type: 'bar',
                    data: {
                        labels: incomeLabels,
                        datasets: [
                            {
                                label: 'Marginal Tax Rate',
                                data: marginalTaxData,
                                backgroundColor: 'rgba(184, 68, 47, 0.7)',
                                borderColor: '#b8442f',
                                borderWidth: 2,
                                type: 'line',
                                yAxisID: 'y'
                            },
                            {
                                label: 'Effective Tax Rate on Conversion',
                                data: effectiveTaxData,
                                backgroundColor: 'rgba(30, 42, 74, 0.7)',
                                borderColor: '#1e2a4a',
                                borderWidth: 1
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            tooltip: {
                                callbacks: {
                                    label: function (context) {
                                        return `${context.dataset.label}: ${context.parsed.y.toFixed(2)}%`;
                                    }
                                }
                            },
                            legend: {
                                position: 'top'
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                max: Math.max(Math.max(...marginalTaxData), Math.max(...effectiveTaxData)) + 5,
                                ticks: {
                                    callback: function (value) {
                                        return value + '%';
                                    }
                                },
                                title: {
                                    display: true,
                                    text: 'Tax Rate (%)'
                                }
                            }
                        }
                    }
                });

                // RMD Chart
                const rmdLabels = analysisData.years.filter(y => analysisData.rmdAmounts[y] > 0)
                    .map(y => `Age ${analysisData.inputs.currentAge + y}`);
                const rmdData = analysisData.rmdAmounts.filter(a => a > 0);

                createOrUpdateChart('rmdChart', {
                    type: 'line',
                    data: {
                        labels: rmdLabels,
                        datasets: [{
                            label: 'Projected RMD',
                            data: rmdData,
                            borderColor: '#c0562a',
                            backgroundColor: 'rgba(192, 86, 42, 0.1)',
                            borderWidth: 3,
                            fill: true,
                            pointRadius: 4,
                            pointBackgroundColor: '#c0562a'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            tooltip: {
                                callbacks: {
                                    label: function (context) {
                                        return `RMD: ${formatCurrency(context.parsed.y)}`;
                                    }
                                }
                            }
                        },
                        scales: {
                            y: {
                                ticks: {
                                    callback: function (value) {
                                        return formatCurrency(value);
                                    }
                                }
                            }
                        }
                    }
                });
            }

            function updateTables() {
                // Enhanced Conversion Table
                let convHTML = `
                    <thead>
                        <tr>
                            <th>Year</th>
                            <th>Age</th>
                            <th>Original Amount</th>
                            ${analysisData.inputs.enableAssetDiscount ? '<th>Discounted Value</th><th>Effective Discount</th>' : ''}
                            <th>Federal Tax</th>
                            <th>State Tax</th>
                            <th>Total Tax</th>
                            <th>Effective Tax Rate</th>
                            <th>Marginal Rate</th>
                        </tr>
                    </thead>
                    <tbody>
                `;

                analysisData.inputs.conversions.forEach(c => {
                    const year = c.year;
                    const federalTax = analysisData.federalTaxes[year] || 0;
                    const stateTax = analysisData.stateTaxes[year] || 0;
                    const totalTax = analysisData.conversionTaxes[year] || 0;
                    const discountedValue = analysisData.discountedConversions[year] || c.amount;
                    const effectiveDiscountRate = analysisData.effectiveDiscountRates[year] || 0;
                    const effectiveRate = discountedValue > 0 ? (totalTax / discountedValue) : 0;
                    const marginalRate = analysisData.marginalRates[year] || 0;

                    convHTML += `
                        <tr>
                            <td>${year + 1}</td>
                            <td>${analysisData.inputs.currentAge + year}</td>
                            <td>${formatCurrency(c.amount)}</td>
                            ${analysisData.inputs.enableAssetDiscount ?
                            `<td style="color: var(--warning-color); font-weight: 600;">${formatCurrency(discountedValue)}</td>
                                 <td style="color: var(--success-color); font-weight: 600;">${formatPercent(effectiveDiscountRate)}</td>` : ''
                        }
                            <td>${formatCurrency(federalTax)}</td>
                            <td>${formatCurrency(stateTax)}</td>
                            <td>${formatCurrency(totalTax)}</td>
                            <td>${formatPercent(effectiveRate)}</td>
                            <td>${formatPercent(marginalRate)}</td>
                        </tr>
                    `;
                });
                document.getElementById('conversionTable').innerHTML = convHTML + '</tbody>';

                // Enhanced Detailed Analysis Table
                let detailHTML = `
                    <thead>
                        <tr>
                            <th>Year</th>
                            <th>Age</th>
                            <th>Do Nothing (After-Tax)</th>
                            <th>Roth Balance</th>
                            <th>Invested Tax $ (After-Tax)</th>
                            <th>Roth Conversion (After-Tax)</th>
                            <th>Net Advantage</th>
                            <th>RMD</th>
                            <th>MAGI</th>
                            <th>IRMAA Tier</th>
                        </tr>
                    </thead>
                    <tbody>
                `;

                analysisData.years.forEach((year, index) => {
                    if (index % 2 === 0 || year >= 40) { // Show every other year until year 40, then all years
                        const adv = analysisData.netAdvantage[year];
                        const tier = analysisData.irmaaTierByYear[year] || 0;
                        const age = analysisData.inputs.currentAge + year;
                        const tierLabel = age < 63 ? '—' : (tier === 0 ? 'Standard' : `Tier ${tier}`);
                        detailHTML += `
                            <tr>
                                <td>${year}</td>
                                <td>${age}</td>
                                <td>${formatCurrency(analysisData.traditionalAfterTax[year])}</td>
                                <td>${formatCurrency(analysisData.rothIRA[year])}</td>
                                <td>${formatCurrency(analysisData.opportunityCost[year])}</td>
                                <td>${formatCurrency(analysisData.rothNetBenefit[year])}</td>
                                <td class="${adv >= 0 ? 'positive' : 'negative'}">${formatCurrency(adv)}</td>
                                <td>${formatCurrency(analysisData.rmdAmounts[year])}</td>
                                <td>${formatCurrency(analysisData.magiByYear[year])}</td>
                                <td>${tierLabel}</td>
                            </tr>
                        `;
                    }
                });
                document.getElementById('detailedTable').innerHTML = detailHTML + '</tbody>';

                // RMD Table
                let rmdHTML = `
                    <thead>
                        <tr>
                            <th>Age</th>
                            <th>Traditional IRA Balance</th>
                            <th>Life Expectancy Factor</th>
                            <th>Required RMD</th>
                            <th>Tax on RMD</th>
                            <th>After-Tax RMD</th>
                        </tr>
                    </thead>
                    <tbody>
                `;

                analysisData.years.forEach(year => {
                    const age = analysisData.inputs.currentAge + year;
                    if (analysisData.rmdAmounts[year] > 0) {
                        const factor = rmdFactors[age] || 6.4;
                        const rmdTax = analysisData.rmdAmounts[year] * 0.22; // Approximate tax rate
                        const afterTaxRmd = analysisData.rmdAmounts[year] - rmdTax;

                        rmdHTML += `
                            <tr>
                                <td>${age}</td>
                                <td>${formatCurrency(analysisData.traditionalIRA[year] + analysisData.rmdAmounts[year])}</td>
                                <td>${factor}</td>
                                <td>${formatCurrency(analysisData.rmdAmounts[year])}</td>
                                <td>${formatCurrency(rmdTax)}</td>
                                <td>${formatCurrency(afterTaxRmd)}</td>
                            </tr>
                        `;
                    }
                });
                document.getElementById('rmdTable').innerHTML = rmdHTML + '</tbody>';
            }

            function updateHeaderInfo() {
                const currentDate = new Date().toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
                document.getElementById('headerDate').textContent = `Date: ${currentDate}`;
            }

            function updateAgeHints() {
                const currentAge = getInputValue('currentAge');
                const conversionYears = getInputValue('conversionYears');
                const hintEl = document.getElementById('conversionAgeHint');
                if (hintEl && conversionYears > 0) {
                    hintEl.textContent = `Conversions end at age ${currentAge + conversionYears - 1}`;
                } else if (hintEl) {
                    hintEl.textContent = '';
                }
            }

            function showAlerts() {
                const alertsContainer = document.getElementById('alertsContainer');
                let alerts = [];

                // Check for potential issues and opportunities
                if (analysisData.breakEvenYear < 0) {
                    alerts.push({
                        type: 'warning',
                        message: 'Break-even point is beyond the analysis period. Consider reducing conversion amounts or extending the analysis timeframe.'
                    });
                }

                if (analysisData.totalAdvantage < 0) {
                    alerts.push({
                        type: 'warning',
                        message: 'Current strategy shows a net disadvantage. Consider adjusting conversion amounts or timing.'
                    });
                }

                if (analysisData.totalAdvantage > analysisData.inputs.iraBalance * 0.5) {
                    alerts.push({
                        type: 'success',
                        message: 'Excellent opportunity! This strategy could provide substantial long-term benefits.'
                    });
                }

                if (analysisData.inputs.outsideFundsPct < 1) {
                    // Withholding conversion tax from the IRA before 59½ is generally an early
                    // distribution subject to a 10% penalty — flag it as a warning.
                    const earlyWithholding = analysisData.inputs.currentAge < 59.5;
                    const penaltyNote = earlyWithholding
                        ? ' Note: withholding taxes from the IRA before age 59½ may subject that portion to a 10% early-withdrawal penalty (not included in these figures).'
                        : '';
                    alerts.push({
                        type: earlyWithholding ? 'warning' : 'info',
                        message: `Only ${formatPercent(analysisData.inputs.outsideFundsPct)} of conversion taxes are paid from outside funds. Paying more from outside funds (rather than the IRA) generally improves the conversion benefit.${penaltyNote}`
                    });
                }

                // Medicare IRMAA impact of the conversion
                if (analysisData.inputs.enableIRMAA && Math.abs(analysisData.irmaaDelta) > 50) {
                    const addsCost = analysisData.irmaaDelta > 0;
                    alerts.push({
                        type: addsCost ? 'warning' : 'info',
                        message: addsCost
                            ? `Converting adds about ${formatCurrency(analysisData.irmaaDelta)} in Medicare IRMAA surcharges (higher premiums in conversion years). This is already reflected in the net advantage.`
                            : `Converting lowers future Medicare IRMAA surcharges by about ${formatCurrency(-analysisData.irmaaDelta)} (smaller RMDs keep MAGI in lower premium tiers).`
                    });
                }

                // Asset discount specific alerts
                if (analysisData.inputs.enableAssetDiscount) {
                    const totalDiscount = (1 - analysisData.inputs.operationalReduction) * (1 - analysisData.inputs.valuationDiscount);
                    const effectiveDiscountRate = 1 - totalDiscount;

                    if (effectiveDiscountRate > 0.7) {
                        alerts.push({
                            type: 'warning',
                            message: `High discount rate (${formatPercent(effectiveDiscountRate)}) detected. Ensure independent qualified appraisal supports this valuation for IRS compliance.`
                        });
                    }

                    alerts.push({
                        type: 'info',
                        message: '🔍 Asset Discount Active: Conversion taxes calculated on discounted values. Requires qualified independent appraisal for actual implementation.'
                    });

                    if (analysisData.totalDiscountBenefit > 0) {
                        alerts.push({
                            type: 'success',
                            message: `💰 Estimated tax savings from asset discount: ${formatCurrency(analysisData.effectiveTaxSavings)}. Results depend on IRS acceptance of appraisal.`
                        });
                    }
                }

                alertsContainer.innerHTML = alerts.map(alert =>
                    `<div class="alert alert-${alert.type}"><i class="fas fa-${alert.type === 'success' ? 'check-circle' : alert.type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i> ${alert.message}</div>`
                ).join('');
            }

            function calculateAndDisplay() {
                try {
                    toggleUIElements();
                    updateAgeHints();
                    updateHeaderInfo();

                    const inputs = getCurrentInputs();
                    inputs.conversions = getConversionAmounts(inputs);
                    analysisData = performCalculations(inputs);

                    // Make analysis data available globally
                    window.analysisData = analysisData;

                    updateKeyMetrics();
                    updateStrategySummary();
                    updateOpportunityCostBreakdown();
                    updateTaxComparison();
                    updateTables();
                    showAlerts();
                    syncAllSliders();
                    syncControlsUI();
                    updateCaption();
                } catch (error) {
                    // Core numbers failed — log it (no blocking alert that interrupts editing).
                    console.error('Calculation error:', error);
                    return;
                }

                // Charts are isolated: a chart failure must never blank the numbers/tables.
                try {
                    renderAllCharts();
                } catch (error) {
                    console.error('Chart rendering error:', error);
                }
            }

            // Render every chart (single-screen layout — all sections visible).
            function renderAllCharts() {
                createComparisonChart();
                createOpportunityChart();
                createConversionChart();
                createAdvancedCharts();
                createTaxesChart();
            }

            // Annual ordinary-income taxes paid by each path over time (today's dollars).
            function createTaxesChart() {
                const labels = analysisData.years.map(y => `Age ${analysisData.inputs.currentAge + y}`);
                createOrUpdateChart('taxesOverTimeChart', {
                    type: 'bar',
                    data: {
                        labels,
                        datasets: [
                            { label: 'Do Nothing', data: analysisData.doNothingTaxByYear, backgroundColor: 'rgba(47, 111, 143, 0.6)', borderColor: CHART_COLORS.ocean, borderWidth: 1 },
                            { label: 'Roth Conversion', data: analysisData.rothTaxByYear, backgroundColor: 'rgba(192, 86, 42, 0.6)', borderColor: CHART_COLORS.coral, borderWidth: 1 }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            tooltip: {
                                backgroundColor: '#faf6ec', titleColor: '#1e2a4a', bodyColor: '#1e2a4a',
                                borderColor: 'rgba(30, 42, 74, 0.15)', borderWidth: 1,
                                callbacks: { label: c => `${c.dataset.label}: ${formatCurrency(c.parsed.y)}` }
                            },
                            legend: { position: 'top', labels: { usePointStyle: true, padding: 15 } }
                        },
                        scales: {
                            x: {
                                grid: { display: false },
                                ticks: {
                                    autoSkip: false, maxRotation: 0, minRotation: 0,
                                    callback: function (value, index, ticks) {
                                        const year = analysisData.years[index];
                                        return (year % 5 === 0 || index === ticks.length - 1) ? this.getLabelForValue(value) : '';
                                    }
                                }
                            },
                            y: {
                                grid: { color: 'rgba(30, 42, 74, 0.08)' },
                                ticks: { callback: v => '$' + Math.round(v / 1000).toLocaleString() + 'K' }
                            }
                        }
                    }
                });
            }

            // Live value labels for sliders.
            function syncSliderValue(el) {
                const span = document.getElementById(el.id + '_val');
                if (!span) return;
                const unit = el.dataset.unit || '';
                span.textContent = `${el.value}${unit}`;
            }
            function syncAllSliders() {
                document.querySelectorAll('.controls-well input[type="range"]').forEach(syncSliderValue);
            }

            // Keep segmented toggles and preset chips in sync with their backing inputs,
            // including when values change programmatically (e.g. Auto-Optimize).
            function syncControlsUI() {
                document.querySelectorAll('.segmented').forEach(group => {
                    group.querySelectorAll('.seg-btn').forEach(btn => {
                        let active = false;
                        if (btn.dataset.toggle) {
                            const cb = document.getElementById(btn.dataset.toggle);
                            active = cb && (cb.checked === (btn.dataset.checked === 'true'));
                        } else if (group.dataset.target) {
                            const sel = document.getElementById(group.dataset.target);
                            active = sel && String(sel.value) === String(btn.dataset.value);
                        }
                        btn.classList.toggle('active', active);
                    });
                });
                const stateSel = document.getElementById('stateResidency');
                if (stateSel) {
                    document.querySelectorAll('#statePresets button').forEach(b => b.classList.toggle('active', b.dataset.state === stateSel.value));
                }
            }

            // Caption under the primary chart — explains the after-tax/net number.
            function updateCaption() {
                const el = document.getElementById('mainCaption');
                if (!el || !analysisData || !analysisData.years) return;
                const f = analysisData.years.length - 1;
                const adv = analysisData.netAdvantage[f];
                const dollars = analysisData.inputs.adjustForInflation ? "in today's dollars" : "in nominal dollars";
                const verb = adv >= 0 ? 'adds' : 'costs';
                el.innerHTML = `The <span class="coral">Roth conversion</span> line is total after-tax wealth ${dollars}. `
                    + `At year ${f} (age ${analysisData.inputs.currentAge + f}), converting ${verb} `
                    + `<strong>${formatCurrency(Math.abs(adv))}</strong> versus doing nothing — after paying `
                    + `<strong>${formatCurrency(analysisData.totalTaxesPaid)}</strong> in conversion taxes.`;
            }

            function showTab(tabName, forceUpdate = false) {
                if (!forceUpdate) {
                    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
                    document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');
                    document.querySelectorAll('.tab-content > div').forEach(content => content.classList.add('hidden'));
                    document.getElementById(tabName + 'Tab').classList.remove('hidden');
                }

                // Create charts based on active tab
                setTimeout(() => {
                    switch (tabName) {
                        case 'summary':
                            createComparisonChart();
                            break;
                        case 'opportunity':
                            createOpportunityChart();
                            break;
                        case 'strategy':
                            createConversionChart();
                            break;
                        case 'tax':
                        case 'scenarios':
                        case 'rmd':
                            createAdvancedCharts();
                            break;
                    }
                }, 50);
            }

            function optimizeConversions() {
                const inputs = getCurrentInputs();
                const chosen = federalTaxBrackets.find(b => b.rate === inputs.maxTaxBracket) || federalTaxBrackets[2];
                // Use the higher of the chosen bracket and the bracket that currently contains the
                // client's income, so high earners still get a real plan (fill their current bracket).
                const currentTaxable = getFederalTaxableIncome(inputs.currentIncome);
                const containing = federalTaxBrackets.find(b => currentTaxable <= b.max) || federalTaxBrackets[federalTaxBrackets.length - 1];
                const targetBracket = chosen.max >= containing.max ? chosen : containing;

                // Optimal annual conversion = room left in the target bracket (incl. OBBBA senior bonus).
                const seniorBonus = getSeniorBonusDeduction(targetBracket.max + federalStandardDeduction, inputs.currentAge, projectionBaseYear);
                const roomInBracket = Math.max(0, getFederalGrossCeilingForBracket(targetBracket, seniorBonus) - inputs.currentIncome);
                const optimalAnnual = Math.min(roomInBracket, inputs.iraBalance * 0.15); // cap at 15% of IRA/yr

                let message;
                if (containing.max === Infinity) {
                    // Already in the top bracket — there is no ceiling to "fill", so the bracket-fill
                    // heuristic doesn't apply. Don't auto-set a plan; explain the trade-off instead.
                    message = { type: 'warning', html: `<i class="fas fa-triangle-exclamation"></i> Your income is already at the top tax bracket, so there's no lower-bracket headroom to convert into. A conversion here is taxed at your top rate — it only helps if your future retirement rate would be higher.` };
                } else if (optimalAnnual > 0) {
                    const optimalTotal = Math.min(inputs.iraBalance * 0.7, optimalAnnual * 10); // ≤70% over ≤10 yrs
                    const optimalYears = Math.min(10, Math.max(3, Math.ceil(optimalTotal / optimalAnnual)));

                    document.getElementById('totalConversionAmount').value = (Math.round(optimalTotal / 1000) * 1000).toLocaleString();
                    document.getElementById('conversionYears').value = optimalYears;
                    document.getElementById('conversionStrategy').value = 'optimized';
                    document.getElementById('multiYearStrategy').checked = true;

                    const fallbackNote = targetBracket.rate !== inputs.maxTaxBracket
                        ? ` Your income already fills the ${formatPercent(inputs.maxTaxBracket)} bracket, so this fills the ${formatPercent(targetBracket.rate)} bracket instead.`
                        : '';
                    message = { type: 'success', html: `<i class="fas fa-check-circle"></i> Strategy optimized — a ${optimalYears}-year conversion of ${formatCurrency(optimalTotal)} fills the ${formatPercent(targetBracket.rate)} tax bracket.${fallbackNote}` };
                } else {
                    message = { type: 'warning', html: `<i class="fas fa-triangle-exclamation"></i> No bracket headroom is available — check the IRA balance and income inputs to model a conversion.` };
                }

                calculateAndDisplay();

                // Prepend after calculateAndDisplay() (which rebuilds the alerts container).
                const alertsContainer = document.getElementById('alertsContainer');
                alertsContainer.innerHTML = `<div class="alert alert-${message.type}">${message.html}</div>` + alertsContainer.innerHTML;
            }

            /*************  ✨ Windsurf Command ⭐  *************/
            /**
             * Generates a print-friendly report with key findings and visualizations.
             * 
             * The report includes an executive summary with key metrics, a projected net worth comparison chart,
             * a recommended conversion schedule table, and a full disclosure statement.
             * 
             * The report is generated in the `#print-report-container` element, and the browser's print dialog is opened.
             */
            /*******  19fb3606-dada-4cc4-99ad-62b0b9efe408 *******/
            // Editorial PDF export (jsPDF). Falls back to the print report if jsPDF is unavailable.
            function generateEditorialPDF() {
                if (!window.jspdf || !window.jspdf.jsPDF) { generateReport(); return; }
                try {
                    const d = analysisData;
                    if (!d || !d.years) { generateReport(); return; }
                    const inp = getCurrentInputs();
                    const f = d.years.length - 1;
                    const { jsPDF } = window.jspdf;
                    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
                    const W = doc.internal.pageSize.getWidth();
                    const H = doc.internal.pageSize.getHeight();
                    const M = 54;
                    const INK = [30, 42, 74], CORAL = [192, 86, 42], BONE = [236, 228, 210], PAPER = [250, 246, 236], GRAY = [111, 106, 92], NAVY = [21, 36, 91], HAIR = [210, 203, 186];
                    const money = v => formatCurrency(v);
                    const signed = v => (v >= 0 ? '+' : '−') + formatCurrency(Math.abs(v));
                    const fmtPct = v => (v * 100).toFixed((v * 100) % 1 ? 1 : 0) + '%';
                    const dollarsLabel = inp.adjustForInflation ? "today's dollars" : "nominal dollars";
                    const bg = () => { doc.setFillColor(...PAPER); doc.rect(0, 0, W, H, 'F'); doc.setFillColor(...NAVY); doc.rect(0, 0, W, 8, 'F'); };
                    const eyebrow = (t, x, y, col = CORAL) => { doc.setFont('courier', 'bold'); doc.setFontSize(8); doc.setTextColor(...col); doc.text(t.toUpperCase(), x, y, { charSpace: 1.4 }); };

                    // Cover
                    bg();
                    let y = 130;
                    eyebrow('Interactive Illustration · AWM', M, y);
                    y += 32; doc.setFont('times', 'normal'); doc.setFontSize(34); doc.setTextColor(...INK); doc.text('Roth Conversion Analysis', M, y);
                    y += 26; doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(...GRAY);
                    doc.text(doc.splitTextToSize(`A whole-portfolio comparison of converting vs. doing nothing — after-tax, in ${dollarsLabel}, over a ${f}-year horizon.`, W - 2 * M), M, y);
                    y += 54;
                    const cells = [
                        ['Net Advantage at Year ' + f, signed(Math.round(d.netAdvantage[f])), d.netAdvantage[f] >= 0 ? CORAL : INK],
                        ['Break-Even', d.breakEvenYear >= 0 ? ('Year ' + d.breakEvenYear) : 'Beyond horizon', INK],
                        ['Roth Strategy (after-tax)', money(d.rothNetBenefit[f]), INK],
                        ['Do Nothing (after-tax)', money(d.traditionalAfterTax[f]), INK]
                    ];
                    const cw = (W - 2 * M - 16) / 2, chh = 72;
                    cells.forEach((c, i) => {
                        const cx = M + (i % 2) * (cw + 16), cy = y + Math.floor(i / 2) * (chh + 16);
                        doc.setFillColor(...BONE); doc.rect(cx, cy, cw, chh, 'F');
                        doc.setFont('courier', 'bold'); doc.setFontSize(7); doc.setTextColor(...GRAY); doc.text(c[0].toUpperCase(), cx + 14, cy + 24, { charSpace: 1 });
                        doc.setFont('times', 'normal'); doc.setFontSize(20); doc.setTextColor(...c[2]); doc.text(String(c[1]), cx + 14, cy + 52);
                    });
                    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GRAY);
                    doc.text('Prepared ' + new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) + '  ·  Able Wealth Management', M, H - 50);

                    // Assumptions
                    doc.addPage(); bg(); y = 96; eyebrow('Assumptions', M, y);
                    y += 26; doc.setFont('times', 'normal'); doc.setFontSize(22); doc.setTextColor(...INK); doc.text('Inputs & Assumptions', M, y);
                    y += 12; doc.setDrawColor(...INK); doc.setLineWidth(0.6); doc.line(M, y, W - M, y);
                    const stName = s => (stateTaxInfo[s] || {}).name || s;
                    const rows = [
                        ['Filing status', inp.filingStatus === 'mfj' ? 'Married filing jointly' : 'Single'],
                        ['State (current / retirement)', `${stName(inp.stateResidency)} / ${stName(inp.retirementState)}`],
                        ['Current age → retirement age', `${inp.currentAge} → ${inp.retirementAge}`],
                        ['Current IRA balance', money(inp.iraBalance)],
                        ['Current annual income', money(inp.currentIncome)],
                        ['Conversion', inp.isMultiYear ? `${money(inp.totalConversionAmount)} over ${inp.conversionYears} yrs (${inp.conversionStrategy})` : `${money(inp.conversionAmount)} (single year)`],
                        ['Pre / post-retirement return', `${fmtPct(inp.preRetirementReturn)} / ${fmtPct(inp.postRetirementReturn)}`],
                        ['Inflation / discount rate', `${fmtPct(inp.inflationRate)} / ${fmtPct(inp.discountRate)}`],
                        ['Taxes paid from outside funds', fmtPct(inp.outsideFundsPct)],
                        ['Capital gains', inp.progressiveCapGains ? 'Progressive (0/15/20%)' : fmtPct(inp.capitalGainsRate)],
                        ['Social Security', inp.includeSocialSecurity ? money(inp.socialSecurityBenefit) + '/yr' : 'Not included'],
                        ['Other retirement income', money(inp.otherRetirementIncome)],
                        ['RMD start age', String(inp.rmdAge)],
                        ['Modeling', [inp.enableNIIT && 'NIIT', inp.enableIRMAA && 'IRMAA', inp.stepUpAtDeath && 'Step-up', inp.modelSurvivor && 'Widow penalty', inp.modelHeir && ('Heir ' + fmtPct(inp.heirTaxRate))].filter(Boolean).join(', ') || '—'],
                        ['Analysis horizon', `${inp.analysisYear} years`]
                    ];
                    y += 6; doc.setFontSize(10);
                    rows.forEach(([k, v]) => {
                        y += 23;
                        doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRAY); doc.text(k, M, y);
                        doc.setFont('times', 'normal'); doc.setTextColor(...INK); doc.text(String(v), W - M, y, { align: 'right' });
                        doc.setDrawColor(...HAIR); doc.setLineWidth(0.3); doc.line(M, y + 7, W - M, y + 7);
                    });

                    // Results
                    doc.addPage(); bg(); y = 96; eyebrow('Results', M, y);
                    y += 26; doc.setFont('times', 'normal'); doc.setFontSize(22); doc.setTextColor(...INK); doc.text('Projected Outcome', M, y);
                    y += 12; doc.setDrawColor(...INK); doc.setLineWidth(0.6); doc.line(M, y, W - M, y); y += 22;
                    try { const cc = charts['comparisonChart']; if (cc && cc.toBase64Image) { doc.addImage(cc.toBase64Image(), 'PNG', M, y, W - 2 * M, 220); y += 244; } } catch (e) { /* chart not ready */ }
                    eyebrow('Lifetime Tax Comparison (PV @ ' + fmtPct(inp.discountRate) + ')', M, y, GRAY); y += 18;
                    doc.setFontSize(11);
                    [['Do-nothing IRA taxes', money(d.doNothingLifetimeTax), INK], ['Roth strategy taxes', money(d.rothLifetimeTax), INK], ['Lifetime tax saved', money(d.lifetimeTaxSavings), CORAL]].forEach(([k, v, col]) => {
                        doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRAY); doc.text(k, M, y);
                        doc.setFont('times', 'normal'); doc.setTextColor(...col); doc.text(v, W - M, y, { align: 'right' }); y += 19;
                    });

                    // Closing
                    doc.addPage(); bg(); y = 130; eyebrow('Important', M, y);
                    y += 26; doc.setFont('times', 'normal'); doc.setFontSize(20); doc.setTextColor(...INK); doc.text('Hypothetical illustration', M, y);
                    y += 26; doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...GRAY);
                    const disc = 'Outputs are mathematical projections based on the inputs and assumptions shown, using 2026 federal schedules as amended by the One Big Beautiful Bill Act (OBBBA) and representative state, Medicare IRMAA, NIIT, and Social Security rules. Actual results vary with markets, future legislation, and individual facts; many figures (IRMAA, NIIT, SS thresholds) are estimates. This is not tax, legal, or investment advice — review with your CPA and advisor before acting. Able Wealth Management LLC is a registered investment adviser; registration does not imply a particular level of skill or training (CRD #298085).';
                    doc.text(doc.splitTextToSize(disc, W - 2 * M), M, y);

                    doc.save('roth-conversion-scenario.pdf');
                } catch (err) {
                    console.error('PDF export failed:', err);
                    generateReport();
                }
            }

            function generateReport() {
                try {
                    // Check if analysis data exists
                    if (!analysisData || !analysisData.years || analysisData.years.length === 0) {
                        alert('Please run the analysis first by entering your information in the input fields.');
                        return;
                    }

                    // Ensure the comparison chart is rendered and available for the report
                    createComparisonChart();

                    // Wait for chart to be fully rendered before capturing
                    setTimeout(() => {
                        try {
                            const inputs = getCurrentInputs();
                            const clientName = inputs.clientName;
                            const reportDate = new Date().toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                            });

                            // Create enhanced report content with better chart handling
                            let chartImage = '';
                            if (charts.comparisonChart) {
                                try {
                                    // Force chart update and render
                                    charts.comparisonChart.update();
                                    chartImage = charts.comparisonChart.toBase64Image('image/png', 1.0);
                                    console.log('Chart image generated successfully');
                                } catch (e) {
                                    console.warn('Could not generate chart image:', e);
                                    // Try alternative method
                                    try {
                                        chartImage = charts.comparisonChart.toBase64Image();
                                    } catch (e2) {
                                        console.error('Chart image generation failed completely:', e2);
                                        chartImage = '';
                                    }
                                }
                            } else {
                                console.warn('Comparison chart not available');
                                // Try to create the chart again
                                createComparisonChart();
                                if (charts.comparisonChart) {
                                    try {
                                        chartImage = charts.comparisonChart.toBase64Image('image/png', 1.0);
                                    } catch (e) {
                                        console.error('Retry chart generation failed:', e);
                                    }
                                }
                            }

                            const metricsElement = document.getElementById('keyMetrics');
                            const metricsHTML = metricsElement ? metricsElement.innerHTML : '<p>Metrics not available</p>';

                            const conversionTableElement = document.getElementById('conversionTable');
                            const conversionTableHTML = conversionTableElement ? conversionTableElement.outerHTML : '<p>Conversion table not available</p>';

                            const disclosureElement = document.querySelector('.disclosure');
                            const fullDisclosureHTML = disclosureElement ? disclosureElement.innerHTML : '<p>Disclosure information not available</p>';

                            // Generate client summary
                            const clientSummary = `
                                <div class="key-insights no-page-break">
                                    <h4>Client Profile Summary</h4>
                                    <ul>
                                        <li><strong>Age:</strong> ${inputs.currentAge} years old (Retirement planned at age ${inputs.retirementAge})</li>
                                        <li><strong>Current IRA Balance:</strong> ${formatCurrency(inputs.iraBalance)}</li>
                                        <li><strong>Annual Income:</strong> ${formatCurrency(inputs.currentIncome)}</li>
                                        <li><strong>State of Residency:</strong> ${stateTaxInfo[inputs.stateResidency]?.name || inputs.stateResidency}</li>
                                        <li><strong>Conversion Strategy:</strong> ${inputs.isMultiYear ? `${inputs.conversionYears}-year ${inputs.conversionStrategy} strategy` : 'Single-year conversion'}</li>
                                        <li><strong>Total Conversion Amount:</strong> ${formatCurrency(inputs.isMultiYear ? inputs.totalConversionAmount : inputs.conversionAmount)}</li>
                                    </ul>
                                </div>
                            `;

                            // Generate key insights
                            const keyInsights = `
                                <div class="key-insights no-page-break">
                                    <h4>Key Analysis Insights</h4>
                                    <ul>
                                        <li>The Roth conversion strategy ${analysisData.totalAdvantage >= 0 ? 'provides a net benefit' : 'results in a net cost'} of <strong>${formatCurrency(Math.abs(analysisData.totalAdvantage))}</strong> over the analysis period.</li>
                                        <li>Break-even point: ${analysisData.breakEvenYear >= 0 ? `Year ${analysisData.breakEvenYear} (age ${inputs.currentAge + analysisData.breakEvenYear})` : 'Beyond the analysis period'}.</li>
                                        <li>Total tax investment required: <strong>${formatCurrency(analysisData.totalTaxesPaid)}</strong> (${formatPercent(inputs.outsideFundsPct)} paid from outside funds, the rest from IRA withdrawals).</li>
                                        <li>Conversion ROI: <strong>${formatPercent((analysisData.totalAdvantage / analysisData.totalTaxesPaid))}</strong> return on tax payments over the analysis period.</li>
                                        ${analysisData.inputs.enableAssetDiscount ? `<li>Asset valuation discount applied: Estimated tax savings of <strong>${formatCurrency(analysisData.effectiveTaxSavings || 0)}</strong> (subject to IRS acceptance of qualified appraisal).</li>` : ''}
                                    </ul>
                                </div>
                            `;

                            // Generate recommendations
                            const recommendations = `
                                <div class="key-insights no-page-break">
                                    <h4>Professional Recommendations</h4>
                                    <ul>
                                        <li>${analysisData.totalAdvantage >= 0 ? '<strong>Proceed</strong> with the Roth conversion strategy as outlined.' : '<strong>Reconsider</strong> the current conversion strategy or explore alternative approaches.'}</li>
                                        ${inputs.outsideFundsPct < 1 ? '<li>Consider paying a larger share of conversion taxes from <strong>outside sources</strong> rather than IRA withdrawals to maximize conversion benefits.</li>' : '<li>Paying taxes from outside funds optimizes the conversion strategy effectiveness.</li>'}
                                        ${analysisData.breakEvenYear > 15 ? '<li>Note the extended break-even period; ensure this aligns with your long-term financial goals and timeline.</li>' : ''}
                                        <li>Monitor tax law changes that could impact the analysis assumptions.</li>
                                        <li>Consider implementing conversions during market downturns to maximize tax efficiency.</li>
                                        ${analysisData.inputs.enableAssetDiscount ? '<li><strong>Asset Discount Strategy:</strong> Requires qualified independent appraisal and IRS compliance. Consult with tax professionals before implementation.</li>' : ''}
                                    </ul>
                                </div>
                            `;

                            // Add executive summary
                            const executiveSummary = `
                                <div class="executive-summary">
                                    <h3>Executive Summary</h3>
                                    <p><strong>Investment Recommendation:</strong> ${analysisData.totalAdvantage >= 0 ? 'Proceed with' : 'Reconsider'} the proposed Roth conversion strategy based on current analysis.</p>
                                    <p><strong>Financial Impact:</strong> Projected net ${analysisData.totalAdvantage >= 0 ? 'benefit' : 'cost'} of ${formatCurrency(Math.abs(analysisData.totalAdvantage))} over the ${analysisData.years.length - 1}-year analysis period.</p>
                                    <p><strong>Break-Even Analysis:</strong> ${analysisData.breakEvenYear >= 0 ? `Conversion becomes profitable in Year ${analysisData.breakEvenYear} (age ${inputs.currentAge + analysisData.breakEvenYear})` : 'Break-even point extends beyond the current analysis timeframe'}.</p>
                                    <p><strong>Tax Investment Required:</strong> ${formatCurrency(analysisData.totalTaxesPaid)} in conversion taxes represents ${formatPercent(analysisData.totalTaxesPaid / (inputs.isMultiYear ? inputs.totalConversionAmount : inputs.conversionAmount))} of the conversion amount.</p>
                                    <p><strong>Strategic Timing:</strong> ${inputs.isMultiYear ? `Multi-year approach spreads tax impact over ${inputs.conversionYears} years, potentially optimizing tax efficiency` : 'Single-year conversion provides immediate tax certainty but may result in higher marginal rates'}.</p>
                                </div>
                            `;

                            const reportHTML = `
                                <div class="print-header no-page-break">
                                    <div class="print-company-section">
                                        <h1 class="print-company-name">Able Wealth Management</h1>
                                        <p class="print-company-tagline">Comprehensive Financial Planning & Investment Management</p>
                                    </div>
                                    <div class="print-header-info">
                                        <h2>Roth Conversion Analysis Report</h2>
                                        ${clientName ? `<p><strong>Prepared for:</strong> ${clientName}</p>` : ''}
                                        <p><strong>Report Date:</strong> ${reportDate}</p>
                                        <p><strong>Analysis Period:</strong> ${analysisData.years.length - 1} years</p>
                                        <p><strong>Advisor:</strong> Able Wealth Management Team</p>
                                    </div>
                                </div>

                                ${executiveSummary}

                                ${clientSummary}

                                <h3 class="print-section-header">Key Performance Metrics</h3>
                                <div class="results-grid no-page-break">${metricsHTML}</div>

                                ${keyInsights}

                                ${chartImage ? `
                                <div class="chart-section">
                                    <h3 class="print-section-header">Projected Net Worth Comparison</h3>
                                    <img src="${chartImage}" class="chart-image" alt="Net Worth Comparison Chart">
                                    <p style="font-size: 9pt; text-align: center; color: #666; margin-top: 0.5em;">
                                        This chart compares the projected after-tax value of the Roth conversion strategy versus maintaining traditional IRA assets over time.
                                    </p>
                                </div>
                                ` : ''}

                                <div class="print-table-container">
                                    <h3 class="print-section-header">Recommended Conversion Schedule</h3>
                                    ${conversionTableHTML}
                                </div>

                                ${recommendations}

                                <div class="print-disclosure">
                                    <h4>Important Disclosures & Disclaimers</h4>
                                    ${fullDisclosureHTML}
                                    <p><strong>Report Methodology:</strong> This analysis applies 2026 federal income tax schedules (married filing jointly) as adjusted by the IRS for inflation (Rev. Proc. 2025-32) and amended by the One Big Beautiful Bill Act (OBBBA), which made the TCJA rate brackets permanent. It incorporates the OBBBA senior bonus deduction (tax years 2025–2028, age 65+) where applicable, the $32,200 standard deduction, and the SECURE 2.0 required minimum distribution age of 73. Results are projections based on client-provided information and stated assumptions, and do not guarantee future performance. All recommendations should be reviewed with qualified tax and legal professionals before implementation.</p>
                                    <p><strong>Analysis Date:</strong> ${reportDate} | <strong>Software Version:</strong> Roth Conversion Analyzer Pro (2026 Tax Year)</p>
                                </div>
                            `;

                            const reportContainer = document.getElementById('print-report-container');
                            if (reportContainer) {
                                reportContainer.innerHTML = reportHTML;
                            } else {
                                console.error('Print report container not found');
                                alert('Error: Could not generate report. Please try again.');
                                return;
                            }

                            // Trigger print dialog with a short delay
                            setTimeout(() => {
                                window.print();
                            }, 100);

                        } catch (error) {
                            console.error('Error in setTimeout for report generation:', error);
                            alert('Error generating report: ' + error.message);
                        }
                    }, 500); // Give chart time to render

                } catch (error) {
                    console.error('Error generating report:', error);
                    alert('Error generating report: ' + error.message + '. Please try again.');
                }
            }

            function initialize() {
                // Input change listeners
                const inputsToWatch = [
                    'filingStatus', 'enableIRMAA', 'enableNIIT',
                    'progressiveCapGains', 'stepUpAtDeath', 'modelSurvivor', 'survivorAge', 'modelHeir', 'heirTaxRate', 'customStateRate',
                    'stateResidency', 'currentAge', 'retirementAge', 'iraBalance',
                    'currentIncome', 'totalConversionAmount', 'conversionYears', 'preRetirementReturn',
                    'postRetirementReturn', 'inflationRate', 'adjustForInflation', 'multiYearStrategy', 'conversionStrategy',
                    'discountRate', 'outsideFundsPct', 'taxableAccountReturn',
                    'maxTaxBracket', 'conversionAmount', 'capitalGainsRate', 'rmdAge',
                    'includeSocialSecurity', 'socialSecurityBenefit', 'incomeGrowthRate',
                    'relocateInRetirement', 'retirementState', 'otherRetirementIncome',
                    'enableAssetDiscount', 'valuationDiscount', 'operationalReduction', 'discountStrategy',
                    'analysisYear'
                ];

                // Debounce the (heavy) full recompute so dragging sliders stays smooth.
                let calcTimer = null;
                const debouncedCalc = () => {
                    clearTimeout(calcTimer);
                    calcTimer = setTimeout(calculateAndDisplay, 160);
                };

                inputsToWatch.forEach(id => {
                    const element = document.getElementById(id);
                    if (element) {
                        element.addEventListener('input', debouncedCalc);
                        element.addEventListener('change', calculateAndDisplay);
                    }
                });

                // Instant live value next to each slider (independent of the debounced recompute).
                document.querySelectorAll('.controls-well input[type="range"]').forEach(range => {
                    range.addEventListener('input', () => syncSliderValue(range));
                });

                // State preset chips drive the (hidden) state select.
                const presetWrap = document.getElementById('statePresets');
                if (presetWrap) {
                    const stateSel = document.getElementById('stateResidency');
                    const syncPresets = () => presetWrap.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.state === stateSel.value));
                    presetWrap.querySelectorAll('button').forEach(btn => {
                        btn.addEventListener('click', () => {
                            stateSel.value = btn.dataset.state;
                            syncPresets();
                            calculateAndDisplay();
                        });
                    });
                    syncPresets();
                }

                // Segmented toggles drive a hidden <select> (data-value) or checkbox (data-toggle).
                document.querySelectorAll('.segmented').forEach(group => {
                    group.querySelectorAll('.seg-btn').forEach(btn => {
                        btn.addEventListener('click', () => {
                            group.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
                            btn.classList.add('active');
                            if (btn.dataset.toggle) {
                                const cb = document.getElementById(btn.dataset.toggle);
                                if (cb) { cb.checked = btn.dataset.checked === 'true'; }
                            } else if (group.dataset.target) {
                                const sel = document.getElementById(group.dataset.target);
                                if (sel) { sel.value = btn.dataset.value; }
                            }
                            calculateAndDisplay();
                        });
                    });
                });

                // Currency formatting
                document.querySelectorAll('input[data-type="currency"]').forEach(input => {
                    input.addEventListener('blur', (e) => {
                        let value = e.target.value.replace(/[,$]/g, '');
                        if (!isNaN(value) && value !== '') {
                            e.target.value = parseInt(value).toLocaleString();
                        }
                    });
                });

                // Button functionality
                document.getElementById('optimizeBtn').addEventListener('click', optimizeConversions);
                document.getElementById('generateReportBtn').addEventListener('click', generateEditorialPDF);
                document.getElementById('saveScenarioBtn').addEventListener('click', saveCurrentScenario);
                renderScenarios();

                // Initialize calculations. Prefer to wait for Chart.js, but never block the
                // numbers/tables on it — if the CDN is unavailable, run anyway (charts skip safely).
                let chartWaits = 0;
                const initializeApp = () => {
                    if (typeof Chart !== 'undefined' || chartWaits >= 15) {
                        calculateAndDisplay();
                    } else {
                        chartWaits++;
                        setTimeout(initializeApp, 100);
                    }
                };
                initializeApp();

                // Add keyboard shortcuts
                document.addEventListener('keydown', (e) => {
                    if (e.ctrlKey || e.metaKey) {
                        switch (e.key) {
                            case 'o':
                                e.preventDefault();
                                optimizeConversions();
                                break;
                            case 'p':
                                e.preventDefault();
                                generateReport();
                                break;
                        }
                    }
                });

                console.log('Enhanced Roth Conversion Analyzer initialized successfully');
            }

            // Start the application
            initialize();
        });
