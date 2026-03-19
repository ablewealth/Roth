document.addEventListener('DOMContentLoaded', function() {
            let charts = {};
            let analysisData = {};
            let loadingOverlay = null;
            let loadingOverlayTimer = null;
            
            function ensureLoadingOverlay() {
                if (!loadingOverlay) {
                    loadingOverlay = document.createElement('div');
                    loadingOverlay.className = 'loading-overlay';
                    loadingOverlay.innerHTML = '<div class="spinner"></div>';
                    loadingOverlay.style.display = 'none';
                    document.body.appendChild(loadingOverlay);
                }
                return loadingOverlay;
            }

            function showLoadingOverlay() {
                ensureLoadingOverlay().style.display = 'flex';
            }

            function hideLoadingOverlay() {
                if (loadingOverlay) {
                    loadingOverlay.style.display = 'none';
                }
            }

            // Enhanced tax brackets with 2025 adjustments
            const federalTaxBrackets = [
                { min: 0, max: 23850, rate: 0.10 },
                { min: 23850, max: 96950, rate: 0.12 },
                { min: 96950, max: 206700, rate: 0.22 },
                { min: 206700, max: 394600, rate: 0.24 },
                { min: 394600, max: 501050, rate: 0.32 },
                { min: 501050, max: 751600, rate: 0.35 },
                { min: 751600, max: Infinity, rate: 0.37 }
            ];

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
                    standardDeduction: 17050
                },
                'NJ': {
                    name: 'New Jersey',
                    brackets: [
                        { min: 0, max: 20000, rate: 0.014 },
                        { min: 20000, max: 35000, rate: 0.0175 },
                        { min: 35000, max: 40000, rate: 0.035 },
                        { min: 40000, max: 75000, rate: 0.0553 },
                        { min: 75000, max: 500000, rate: 0.0637 },
                        { min: 500000, max: 1000000, rate: 0.0897 },
                        { min: 1000000, max: Infinity, rate: 0.1075 }
                    ],
                    standardDeduction: 0
                },
                'CA': {
                    name: 'California',
                    brackets: [
                        { min: 0, max: 23942, rate: 0.01 },
                        { min: 23942, max: 56746, rate: 0.02 },
                        { min: 56746, max: 89450, rate: 0.04 },
                        { min: 89450, max: 123918, rate: 0.06 },
                        { min: 123918, max: 156456, rate: 0.08 },
                        { min: 156456, max: 1000000, rate: 0.093 },
                        { min: 1000000, max: 1200000, rate: 0.103 },
                        { min: 1200000, max: 2000000, rate: 0.113 },
                        { min: 2000000, max: Infinity, rate: 0.133 }
                    ],
                    standardDeduction: 10726,
                    mentalHealthTax: 0.01
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

            const calculateFederalTax = (income) => calculateTax(income, federalTaxBrackets, 30000);
            
            const calculateStateTax = (income, state) => {
                const info = stateTaxInfo[state];
                if (!info || info.brackets.length === 0) return 0;
                let tax = calculateTax(income, info.brackets, info.standardDeduction);
                if (state === 'CA' && income > 1000000) {
                    tax += (income - 1000000) * info.mentalHealthTax;
                }
                return tax;
            };

            const getMarginalRate = (income, brackets, deduction = 0) => {
                const taxable = Math.max(0, income - deduction);
                const bracket = brackets.find(b => taxable <= b.max);
                return bracket ? bracket.rate : brackets[brackets.length - 1].rate;
            };

            const calculateMarginalFederalTaxRate = (income) => getMarginalRate(income, federalTaxBrackets, 30000);
            const calculateMarginalStateTaxRate = (income, state) => {
                const info = stateTaxInfo[state];
                return info ? getMarginalRate(income, info.brackets, info.standardDeduction) : 0;
            };

            // Enhanced input gathering
            function getCurrentInputs() {
                return {
                    clientName: document.getElementById('clientName').value || 'Client',
                    stateResidency: document.getElementById('stateResidency').value,
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
                    payTaxesFrom: document.getElementById('payTaxesFrom').value,
                    rmdAge: getInputValue('rmdAge'),
                    includeSocialSecurity: document.getElementById('includeSocialSecurity').checked,
                    socialSecurityBenefit: getInputValue('socialSecurityBenefit'),
                    capitalGainsRate: getInputValue('capitalGainsRate') / 100,
                    enableAssetDiscount: document.getElementById('enableAssetDiscount').checked,
                    valuationDiscount: getInputValue('valuationDiscount') / 100,
                    operationalReduction: getInputValue('operationalReduction') / 100,
                    discountStrategy: document.getElementById('discountStrategy').value,
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
                    const targetBracket = federalTaxBrackets.find(b => b.rate === maxTaxBracket);
                    const targetIncome = targetBracket ? targetBracket.max : federalTaxBrackets[2].max;
                    
                    let remainingAmount = total;
                    for (let i = 0; i < years && remainingAmount > 0; i++) {
                        const growingIncome = currentIncome * Math.pow(1 + inputs.incomeGrowthRate, i);
                        const roomInBracket = Math.max(0, targetIncome - growingIncome);
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

            // Enhanced calculation engine
            function performCalculations(inputs) {
                const data = {
                    years: [],
                    traditionalIRA: [],
                    rothIRA: [],
                    traditionalAfterTax: [],
                    rothNetBenefit: [],
                    netAdvantage: [],
                    conversionTaxes: [],
                    federalTaxes: [],
                    stateTaxes: [],
                    cumulativeConversions: [],
                    rmdAmounts: [],
                    marginalRates: [],
                    opportunityCost: [],
                    opportunityGrowth: [],
                    breakEvenPoints: [],
                    discountedConversions: [],
                    effectiveDiscountRates: [],
                    inputs
                };

                let traditionalBalance = inputs.iraBalance;
                let rothBalance = 0;
                let opportunityCost = 0;
                let cumulativeConversions = 0;
                let cumulativeTaxes = 0;
                let cumulativeDiscountBenefit = 0;

                const analysisYears = 45; // Extended for better analysis

                for (let year = 0; year <= analysisYears; year++) {
                    const age = inputs.currentAge + year;
                    const isRetired = age >= inputs.retirementAge;
                    const returnRate = isRetired ? inputs.postRetirementReturn : inputs.preRetirementReturn;
                    const annualIncome = inputs.currentIncome * Math.pow(1 + inputs.incomeGrowthRate, Math.min(year, inputs.retirementAge - inputs.currentAge));
                    
                    // Apply investment returns
                    if (year > 0) {
                        traditionalBalance *= (1 + returnRate);
                        rothBalance *= (1 + returnRate);
                        opportunityCost *= (1 + (isRetired ? inputs.postRetirementReturn : inputs.preRetirementReturn));
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
                        
                        effectiveDiscountRate = calculateEffectiveDiscountRate(conversionAmount, discountedConversionValue);
                        cumulativeDiscountBenefit += (conversionAmount - discountedConversionValue);
                    }
                    
                    let federalTax = 0;
                    let stateTax = 0;
                    let totalTax = 0;
                    let marginalRate = 0;

                    if (conversionAmount > 0) {
                        // Calculate taxes based on discounted conversion value
                        const incomeWithConversion = annualIncome + discountedConversionValue;
                        const incomeWithoutConversion = annualIncome;
                        
                        federalTax = calculateFederalTax(incomeWithConversion) - calculateFederalTax(incomeWithoutConversion);
                        stateTax = calculateStateTax(incomeWithConversion, inputs.stateResidency) - calculateStateTax(incomeWithoutConversion, inputs.stateResidency);
                        totalTax = federalTax + stateTax;
                        
                        marginalRate = calculateMarginalFederalTaxRate(incomeWithConversion) + calculateMarginalStateTaxRate(incomeWithConversion, inputs.stateResidency);
                        
                        cumulativeConversions += conversionAmount; // Track actual IRA amount converted
                        cumulativeTaxes += totalTax;
                        
                        if (inputs.payTaxesFrom === 'ira') {
                            traditionalBalance -= totalTax;
                        } else {
                            opportunityCost += totalTax;
                        }

                        traditionalBalance -= conversionAmount; // Remove actual conversion amount from traditional IRA
                        rothBalance += conversionAmount; // Add actual conversion amount to Roth IRA
                    }
                    
                    // Calculate RMDs
                    let rmd = 0;
                    if (age >= inputs.rmdAge && traditionalBalance > 0) {
                        const factor = rmdFactors[age] || 6.4;
                        rmd = traditionalBalance / factor;
                        traditionalBalance -= rmd;
                    }
                    
                    // Calculate projected retirement tax rate for traditional assets
                    const projectedRetirementIncome = rmd + (inputs.includeSocialSecurity ? inputs.socialSecurityBenefit : 0);
                    const retirementFedRate = calculateMarginalFederalTaxRate(projectedRetirementIncome);
                    const retirementStateRate = calculateMarginalStateTaxRate(projectedRetirementIncome, inputs.stateResidency);
                    const totalRetirementTaxRate = retirementFedRate + retirementStateRate;

                    // Store data points
                    data.years.push(year);
                    data.traditionalIRA.push(traditionalBalance);
                    data.rothIRA.push(rothBalance);
                    data.traditionalAfterTax.push(traditionalBalance * (1 - totalRetirementTaxRate));
                    data.opportunityCost.push(opportunityCost);
                    data.rothNetBenefit.push(rothBalance - opportunityCost);
                    data.netAdvantage.push((rothBalance - opportunityCost) - (traditionalBalance * (1 - totalRetirementTaxRate)));
                    data.federalTaxes[year] = federalTax;
                    data.stateTaxes[year] = stateTax;
                    data.conversionTaxes[year] = totalTax;
                    data.cumulativeConversions[year] = cumulativeConversions;
                    data.rmdAmounts[year] = rmd;
                    data.marginalRates[year] = marginalRate;
                    data.discountedConversions[year] = discountedConversionValue;
                    data.effectiveDiscountRates[year] = effectiveDiscountRate;
                    data.opportunityGrowth[year] = opportunityCost > 0 ? (opportunityCost / cumulativeTaxes - 1) : 0;
                }
                
                // Calculate summary metrics
                data.breakEvenYear = data.netAdvantage.findIndex(adv => adv > 0);
                data.totalAdvantage = data.netAdvantage[analysisYears];
                data.totalTaxesPaid = cumulativeTaxes;
                data.finalOpportunityCost = data.opportunityCost[analysisYears];
                data.opportunityReturn = data.finalOpportunityCost > 0 ? Math.pow(data.finalOpportunityCost / cumulativeTaxes, 1/analysisYears) - 1 : 0;
                data.totalDiscountBenefit = cumulativeDiscountBenefit;
                data.effectiveTaxSavings = cumulativeDiscountBenefit > 0 ? (cumulativeDiscountBenefit * (data.marginalRates.find(r => r > 0) || 0.24)) : 0;
                
                return data;
            }

            // UI Enhancement functions
            function toggleUIElements() {
                const isMultiYear = document.getElementById('multiYearStrategy').checked;
                document.getElementById('conversionStrategyDiv').classList.toggle('hidden', !isMultiYear);
                document.getElementById('singleConversionDiv').classList.toggle('hidden', isMultiYear);
                document.getElementById('incomeGrowthRateGroup').classList.toggle('hidden', !isMultiYear);
                
                const strategy = document.getElementById('conversionStrategy').value;
                document.getElementById('maxBracketDiv').classList.toggle('hidden', strategy !== 'optimized');
                
                document.getElementById('socialSecurityDiv').classList.toggle('hidden', !document.getElementById('includeSocialSecurity').checked);
                
                const enableDiscount = document.getElementById('enableAssetDiscount').checked;
                document.getElementById('assetDiscountDiv').classList.toggle('hidden', !enableDiscount);
            }

            function updateKeyMetrics() {
                const { totalAdvantage, breakEvenYear, totalTaxesPaid, rothNetBenefit, traditionalAfterTax, finalOpportunityCost, opportunityReturn, totalDiscountBenefit, effectiveTaxSavings } = analysisData;
                
                // Get selected analysis year from input
                const analysisYearInput = document.getElementById('analysisYear');
                console.log('Analysis year input element:', analysisYearInput);
                console.log('Analysis year input value:', analysisYearInput ? analysisYearInput.value : 'not found');
                
                const selectedYear = analysisYearInput ? parseInt(analysisYearInput.value) : 45;
                
                console.log('UpdateKeyMetrics - Selected year:', selectedYear);
                console.log('Net advantage array length:', analysisData.netAdvantage ? analysisData.netAdvantage.length : 'undefined');
                
                // Get net advantage for selected year
                const selectedYearAdvantage = analysisData.netAdvantage && analysisData.netAdvantage[selectedYear] !== undefined ? analysisData.netAdvantage[selectedYear] : totalAdvantage;
                
                console.log('Selected year advantage:', selectedYearAdvantage, 'Total advantage:', totalAdvantage);
                console.log('Net advantage at year', selectedYear, ':', analysisData.netAdvantage ? analysisData.netAdvantage[selectedYear] : 'array not available');
                
                // Calculate ROI on conversions
                const conversionROI = totalTaxesPaid > 0 ? ((selectedYearAdvantage / totalTaxesPaid) * 100) : 0;
                
                let metricsHTML = `
                    <div class="metric-card">
                        <div class="metric-value ${selectedYearAdvantage >= 0 ? 'positive' : 'negative'}">${formatCurrency(selectedYearAdvantage)}</div>
                        <div class="metric-label">Net Advantage at Year ${selectedYear}</div>
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
                } else {
                    metricsHTML += `
                        <div class="metric-card">
                            <div class="metric-value">${formatCurrency(finalOpportunityCost)}</div>
                            <div class="metric-label">Opportunity Cost</div>
                        </div>
                    `;
                }
                
                document.getElementById('keyMetrics').innerHTML = metricsHTML;
            }

            function updateStrategySummary() {
                const finalYear = 45;
                const totalRmds = analysisData.rmdAmounts.reduce((a, b) => a + b, 0);
                const tradFinalPreTax = analysisData.traditionalIRA[finalYear];
                const estimatedTaxes = tradFinalPreTax - analysisData.traditionalAfterTax[finalYear];

                document.getElementById('tradPreTaxValue').textContent = formatCurrency(tradFinalPreTax);
                document.getElementById('tradRmdsValue').textContent = formatCurrency(totalRmds);
                document.getElementById('tradTaxesValue').textContent = formatCurrency(estimatedTaxes);
                document.getElementById('tradFinalValue').textContent = formatCurrency(analysisData.traditionalAfterTax[finalYear]);

                document.getElementById('rothBalanceValue').textContent = formatCurrency(analysisData.rothIRA[finalYear]);
                document.getElementById('rothOppCostValue').textContent = formatCurrency(analysisData.opportunityCost[finalYear]);
                document.getElementById('rothTaxesPaidValue').textContent = formatCurrency(analysisData.totalTaxesPaid);
                document.getElementById('rothFinalValue').textContent = formatCurrency(analysisData.rothNetBenefit[finalYear]);
            }

            function updateOpportunityCostBreakdown() {
                const { totalTaxesPaid, finalOpportunityCost, opportunityReturn, totalAdvantage, totalDiscountBenefit, effectiveTaxSavings } = analysisData;
                const taxPaymentYears = analysisData.inputs.isMultiYear ? analysisData.inputs.conversionYears : 1;
                const avgAnnualTax = totalTaxesPaid / taxPaymentYears;
                const effectiveReturn = opportunityReturn * 100;
                
                let breakdownHTML = `
                    <div class="cost-item">
                        <div class="cost-item-value">${formatCurrency(totalTaxesPaid)}</div>
                        <div class="cost-item-label">Total Tax Payments</div>
                    </div>
                    <div class="cost-item">
                        <div class="cost-item-value">${formatCurrency(avgAnnualTax)}</div>
                        <div class="cost-item-label">Avg. Annual Tax Payment</div>
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
                            <div class="cost-item-label">Final Opportunity Cost</div>
                        </div>
                    `;
                }

                breakdownHTML += `
                    <div class="cost-item">
                        <div class="cost-item-value ${totalAdvantage >= 0 ? 'positive' : 'negative'}" style="color: ${totalAdvantage >= 0 ? 'var(--success-color)' : 'var(--error-color)'};">${formatCurrency(Math.abs(totalAdvantage))}</div>
                        <div class="cost-item-label">${totalAdvantage >= 0 ? 'Net Benefit' : 'Net Cost'}</div>
                    </div>
                `;
                
                document.getElementById('opportunityCostBreakdown').innerHTML = breakdownHTML;
            }

            function updateAnalysisYear() {
                console.log('updateAnalysisYear function called!');
                
                const analysisYearSlider = document.getElementById('analysisYear');
                if (!analysisYearSlider) {
                    console.log('Analysis year slider not found in updateAnalysisYear');
                    return;
                }
                
                const selectedYear = parseInt(analysisYearSlider.value);
                console.log('Analysis year changed to:', selectedYear);
                
                // No need to update sidebar display since it's now a number input
                
                // Update the net advantage metric directly
                if (analysisData && analysisData.netAdvantage && analysisData.netAdvantage[selectedYear] !== undefined) {
                    const selectedYearAdvantage = analysisData.netAdvantage[selectedYear];
                    console.log('Net advantage for year', selectedYear, ':', formatCurrency(selectedYearAdvantage));
                    
                    // Find and update the net advantage metric card
                    const metricCards = document.querySelectorAll('.metric-card');
                    console.log('Found metric cards:', metricCards.length);
                    
                    let cardFound = false;
                    metricCards.forEach((card, index) => {
                        const label = card.querySelector('.metric-label');
                        if (label && label.textContent.includes('Net Advantage at Year')) {
                            const valueElement = card.querySelector('.metric-value');
                            if (valueElement) {
                                console.log('Updating net advantage card from', valueElement.textContent, 'to', formatCurrency(selectedYearAdvantage));
                                valueElement.textContent = formatCurrency(selectedYearAdvantage);
                                valueElement.className = `metric-value ${selectedYearAdvantage >= 0 ? 'positive' : 'negative'}`;
                                label.textContent = `Net Advantage at Year ${selectedYear}`;
                                cardFound = true;
                            }
                        }
                    });
                    
                    if (!cardFound) {
                        console.log('Net advantage metric card not found!');
                    }
                } else {
                    console.log('Analysis data not available for year:', selectedYear);
                    if (analysisData) {
                        console.log('analysisData exists, netAdvantage length:', analysisData.netAdvantage ? analysisData.netAdvantage.length : 'undefined');
                    } else {
                        console.log('analysisData does not exist - run calculation first');
                    }
                }
            }

            function createOrUpdateChart(id, config) {
                const ctx = document.getElementById(id);
                if (!ctx) return;
                
                const chartCtx = ctx.getContext('2d');
                if (charts[id]) {
                    charts[id].destroy();
                }
                charts[id] = new Chart(chartCtx, config);
            }

            function createComparisonChart() {
                const labels = analysisData.years.map(year => `Age ${analysisData.inputs.currentAge + year}`);
                createOrUpdateChart('comparisonChart', {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [
                            {
                                label: 'Roth Net Benefit',
                                data: analysisData.rothNetBenefit,
                                borderColor: '#2563eb',
                                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                                borderWidth: 3,
                                fill: false,
                                pointRadius: 0,
                                tension: 0.1
                            },
                            {
                                label: 'Traditional After-Tax',
                                data: analysisData.traditionalAfterTax,
                                borderColor: '#f59e0b',
                                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                                borderWidth: 2,
                                fill: false,
                                pointRadius: 0,
                                tension: 0.1
                            },
                            {
                                label: 'Net Advantage',
                                data: analysisData.netAdvantage,
                                borderColor: '#10b981',
                                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                borderWidth: 2,
                                fill: true,
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
                                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                                titleColor: '#fff',
                                bodyColor: '#fff',
                                borderColor: '#2563eb',
                                borderWidth: 1,
                                callbacks: {
                                    label: function(context) {
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
                                    callback: function(value, index, ticks) {
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
                                    color: 'rgba(0, 0, 0, 0.1)'
                                }
                            },
                            y: {
                                ticks: {
                                    callback: function(value) {
                                        return formatCurrency(value);
                                    }
                                },
                                grid: {
                                    color: 'rgba(0, 0, 0, 0.1)'
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
                                borderColor: '#2563eb',
                                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                                borderWidth: 3,
                                fill: false,
                                pointRadius: 0
                            },
                            {
                                label: 'Opportunity Cost',
                                data: analysisData.opportunityCost,
                                borderColor: '#f59e0b',
                                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                                borderWidth: 2,
                                fill: false,
                                pointRadius: 0
                            },
                            {
                                label: 'Roth Net Value',
                                data: analysisData.rothNetBenefit,
                                borderColor: '#10b981',
                                backgroundColor: 'rgba(16, 185, 129, 0.1)',
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
                                    label: function(context) {
                                        return `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`;
                                    }
                                }
                            }
                        },
                        scales: {
                            x: {
                                ticks: {
                                    callback: function(value, index, ticks) {
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
                                    callback: function(value) {
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
                            backgroundColor: analysisData.netAdvantage.map(adv => adv >= 0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)'),
                            borderColor: analysisData.netAdvantage.map(adv => adv >= 0 ? '#10b981' : '#ef4444'),
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        return `Net Advantage: ${formatCurrency(context.parsed.y)}`;
                                    }
                                }
                            }
                        },
                        scales: {
                            x: {
                                ticks: {
                                    callback: function(value, index) {
                                        return index % 5 === 0 ? this.getLabelForValue(value) : '';
                                    }
                                }
                            },
                            y: {
                                ticks: {
                                    callback: function(value) {
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
                const labels = Array.from({length: convYears}, (_, i) => `Year ${i + 1} (Age ${analysisData.inputs.currentAge + i})`);
                
                createOrUpdateChart('conversionTimelineChart', {
                    type: 'bar',
                    data: {
                        labels,
                        datasets: [
                            {
                                label: 'Federal Tax',
                                data: analysisData.federalTaxes.slice(0, convYears),
                                backgroundColor: 'rgba(239, 68, 68, 0.8)',
                                borderColor: '#ef4444',
                                borderWidth: 1
                            },
                            {
                                label: 'State Tax',
                                data: analysisData.stateTaxes.slice(0, convYears),
                                backgroundColor: 'rgba(245, 158, 11, 0.8)',
                                borderColor: '#f59e0b',
                                borderWidth: 1
                            },
                            {
                                label: 'Conversion Amount',
                                data: analysisData.inputs.conversions.map(c => c.amount),
                                backgroundColor: 'rgba(37, 99, 235, 0.3)',
                                borderColor: '#2563eb',
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
                                    label: function(context) {
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
                                    callback: function(value) {
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
                                    callback: function(value) {
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
                const income = analysisData.inputs.currentIncome;
                const incomeWithConv = income + maxConv;
                
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
                                backgroundColor: 'rgba(37, 99, 235, 0.5)',
                                borderColor: '#2563eb',
                                borderWidth: 1
                            },
                            {
                                label: 'Income + Conversion',
                                data: bracketData,
                                backgroundColor: 'rgba(245, 158, 11, 0.7)',
                                borderColor: '#f59e0b',
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
                                    label: function(context) {
                                        return `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`;
                                    }
                                }
                            }
                        },
                        scales: {
                            y: {
                                ticks: {
                                    callback: function(value) {
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
                            backgroundColor: percentiles.map(val => val >= 0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)'),
                            borderColor: percentiles.map(val => val >= 0 ? '#10b981' : '#ef4444'),
                            borderWidth: 2
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        return `${context.label} Percentile: ${formatCurrency(context.parsed.y)}`;
                                    }
                                }
                            }
                        },
                        scales: {
                            y: {
                                ticks: {
                                    callback: function(value) {
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
                                r.advantage > analysisData.totalAdvantage ? 'rgba(16, 185, 129, 0.7)' : 
                                r.advantage < 0 ? 'rgba(239, 68, 68, 0.7)' : 'rgba(245, 158, 11, 0.7)'
                            ),
                            borderColor: sensitivityResults.map(r => 
                                r.advantage > analysisData.totalAdvantage ? '#10b981' : 
                                r.advantage < 0 ? '#ef4444' : '#f59e0b'
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
                                    label: function(context) {
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
                                    callback: function(value) {
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
                                backgroundColor: 'rgba(239, 68, 68, 0.7)',
                                borderColor: '#ef4444',
                                borderWidth: 2,
                                type: 'line',
                                yAxisID: 'y'
                            },
                            {
                                label: 'Effective Tax Rate on Conversion',
                                data: effectiveTaxData,
                                backgroundColor: 'rgba(59, 130, 246, 0.7)',
                                borderColor: '#3b82f6',
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
                                    label: function(context) {
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
                                    callback: function(value) {
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
                            borderColor: '#f59e0b',
                            backgroundColor: 'rgba(245, 158, 11, 0.1)',
                            borderWidth: 3,
                            fill: true,
                            pointRadius: 4,
                            pointBackgroundColor: '#f59e0b'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        return `RMD: ${formatCurrency(context.parsed.y)}`;
                                    }
                                }
                            }
                        },
                        scales: {
                            y: {
                                ticks: {
                                    callback: function(value) {
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
                            <th>Traditional After-Tax</th>
                            <th>Roth Balance</th>
                            <th>Opportunity Cost</th>
                            <th>Roth Net Benefit</th>
                            <th>Net Advantage</th>
                            <th>RMD</th>
                        </tr>
                    </thead>
                    <tbody>
                `;
                
                analysisData.years.forEach((year, index) => {
                    if (index % 2 === 0 || year >= 40) { // Show every other year until year 40, then all years
                        const adv = analysisData.netAdvantage[year];
                        detailHTML += `
                            <tr>
                                <td>${year}</td>
                                <td>${analysisData.inputs.currentAge + year}</td>
                                <td>${formatCurrency(analysisData.traditionalAfterTax[year])}</td>
                                <td>${formatCurrency(analysisData.rothIRA[year])}</td>
                                <td>${formatCurrency(analysisData.opportunityCost[year])}</td>
                                <td>${formatCurrency(analysisData.rothNetBenefit[year])}</td>
                                <td class="${adv >= 0 ? 'positive' : 'negative'}">${formatCurrency(adv)}</td>
                                <td>${formatCurrency(analysisData.rmdAmounts[year])}</td>
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
                const clientName = document.getElementById('clientName').value || 'Client';
                const currentDate = new Date().toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                });
                document.getElementById('clientNameDisplay').textContent = clientName;
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

                if (analysisData.inputs.payTaxesFrom === 'ira') {
                    alerts.push({
                        type: 'info',
                        message: 'Consider paying conversion taxes from outside funds to maximize the benefit of the conversion strategy.'
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
                if (loadingOverlayTimer) {
                    clearTimeout(loadingOverlayTimer);
                }
                
                loadingOverlayTimer = setTimeout(() => {
                    showLoadingOverlay();
                    loadingOverlayTimer = null;
                }, 150);

                setTimeout(() => {
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
                        updateTables();
                        showAlerts();
                        
                        const activeTab = document.querySelector('.tab.active').dataset.tab;
                        showTab(activeTab, true);
                        
                        // Add animation classes
                        document.querySelectorAll('.metric-card, .strategy-card').forEach((card, index) => {
                            card.style.animationDelay = `${index * 0.1}s`;
                            card.classList.add('fade-in-up');
                        });
                        
                    } catch (error) {
                        console.error('Calculation error:', error);
                        alert('An error occurred during calculation. Please check your inputs and try again.');
                    } finally {
                        if (loadingOverlayTimer) {
                            clearTimeout(loadingOverlayTimer);
                            loadingOverlayTimer = null;
                        }
                        hideLoadingOverlay();
                    }
                }, 0);
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
                const targetBracket = federalTaxBrackets.find(b => b.rate === inputs.maxTaxBracket) || federalTaxBrackets[2];
                const currentMarginalRate = calculateMarginalFederalTaxRate(inputs.currentIncome) + calculateMarginalStateTaxRate(inputs.currentIncome, inputs.stateResidency);
                
                // Calculate optimal conversion amount
                const roomInBracket = Math.max(0, targetBracket.max - inputs.currentIncome);
                const optimalAnnual = Math.min(roomInBracket, inputs.iraBalance * 0.15); // Max 15% per year
                
                if (optimalAnnual > 0) {
                    const optimalTotal = Math.min(inputs.iraBalance * 0.7, optimalAnnual * 10); // Max 70% of IRA over max 10 years
                    const optimalYears = Math.min(10, Math.max(3, Math.ceil(optimalTotal / optimalAnnual)));
                    
                    document.getElementById('totalConversionAmount').value = Math.round(optimalTotal / 1000) * 1000;
                    document.getElementById('conversionYears').value = optimalYears;
                    document.getElementById('conversionStrategy').value = 'optimized';
                    document.getElementById('multiYearStrategy').checked = true;
                    
                    // Show success message
                    const alertsContainer = document.getElementById('alertsContainer');
                    alertsContainer.innerHTML = `
                        <div class="alert alert-success"><i class="fas fa-check-circle"></i> ✅ Strategy optimized! Recommended ${optimalYears}-year conversion of ${formatCurrency(optimalTotal)} 
                            to stay within the ${formatPercent(inputs.maxTaxBracket)} tax bracket.
                        </div>
                    ` + alertsContainer.innerHTML;
                }
                
                calculateAndDisplay();
            }

            function cloneForPrint(element, { outer = false } = {}) {
                if (!element) return '';
                const clone = element.cloneNode(true);
                if (clone.nodeType === 1) {
                    clone.removeAttribute('id');
                    const nodesWithIds = clone.querySelectorAll('[id]');
                    nodesWithIds.forEach(node => node.removeAttribute('id'));
                }
                const markup = outer ? clone.outerHTML : clone.innerHTML;
                return typeof markup === 'string' ? markup.trim() : '';
            }

            function generateReport() {
                if (!analysisData || !analysisData.years || analysisData.years.length === 0) {
                    alert('Please run the analysis before generating the professional report.');
                    return;
                }

                const clientName = document.getElementById('clientName').value || 'Client';
                const reportDate = new Date().toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                });
                
                // Create enhanced report content
                const chartImage = charts.comparisonChart ? charts.comparisonChart.toBase64Image() : '';
                const metricsHTML = cloneForPrint(document.getElementById('keyMetrics'));
                const strategyHTML = cloneForPrint(document.querySelector('.comparison-container'), { outer: true });
                const opportunityHTML = cloneForPrint(document.getElementById('opportunityCostBreakdown'));
                const conversionTableHTML = cloneForPrint(document.getElementById('conversionTable'), { outer: true });
                const detailedTableHTML = cloneForPrint(document.getElementById('detailedTable'), { outer: true });
                const rmdTableHTML = cloneForPrint(document.getElementById('rmdTable'), { outer: true });
                const fullDisclosureHTML = cloneForPrint(document.querySelector('.disclosure'), { outer: true });
                
                // Add executive summary
                const executiveSummary = `
                    <div class="executive-summary">
                        <h3>Executive Summary</h3>
                        <p><strong>Recommendation:</strong> ${analysisData.totalAdvantage >= 0 ? 'Proceed with' : 'Reconsider'} the proposed Roth conversion strategy.</p>
                        <p><strong>Net Benefit:</strong> ${formatCurrency(analysisData.totalAdvantage)} over ${analysisData.years.length - 1} years</p>
                        <p><strong>Break-Even:</strong> ${analysisData.breakEvenYear >= 0 ? `Year ${analysisData.breakEvenYear}` : 'Beyond analysis period'}</p>
                        <p><strong>Total Investment:</strong> ${formatCurrency(analysisData.totalTaxesPaid)} in conversion taxes</p>
                    </div>
                `;

                const opportunitySection = opportunityHTML ? `
                    <div class="print-section">
                        <h3>Opportunity Cost Breakdown</h3>
                        <div class="cost-breakdown">${opportunityHTML}</div>
                    </div>
                ` : '';

                const conversionSection = conversionTableHTML ? `
                    <div class="print-section page-break">
                        <h3 class="schedule-header">Recommended Conversion Schedule</h3>
                        ${conversionTableHTML}
                    </div>
                ` : '';

                const detailedSection = detailedTableHTML ? `
                    <div class="print-section page-break">
                        <h3>Year-by-Year Comparison</h3>
                        ${detailedTableHTML}
                    </div>
                ` : '';

                const rmdSection = rmdTableHTML ? `
                    <div class="print-section page-break">
                        <h3>RMD Schedule</h3>
                        ${rmdTableHTML}
                    </div>
                ` : '';

                const reportHTML = `
                    <div class="print-header">
                        <img src="https://ablewealth.com/AWM%20Logo%203.png" alt="AWM Logo">
                        <div class="print-header-info">
                            <h2>Roth Conversion Analysis Report</h2>
                            <p>Prepared for: ${clientName}</p>
                            <p>Date: ${reportDate}</p>
                            <p>Analyst: Able Wealth Management</p>
                        </div>
                    </div>
                    ${executiveSummary}
                    ${metricsHTML ? `<div class="print-section"><h3>Key Performance Metrics</h3><div class="results-grid">${metricsHTML}</div></div>` : ''}
                    ${strategyHTML ? `<div class="print-section"><h3>Strategy Comparison</h3>${strategyHTML}</div>` : ''}
                    <h3>Projected Net Worth Comparison</h3>
                    <img src="${chartImage}" style="width: 100%; height: auto; margin: 20px 0;">
                    ${opportunitySection}
                    ${conversionSection}
                    ${detailedSection}
                    ${rmdSection}
                    <div class="print-disclosure-flow">${fullDisclosureHTML}</div>
                `;

                const printContainer = document.getElementById('print-report-container');
                if (!printContainer) {
                    console.error('Print container not found.');
                    return;
                }

                printContainer.innerHTML = reportHTML;

                let cleaned = false;
                const cleanupAfterPrint = () => {
                    if (cleaned) return;
                    cleaned = true;
                    printContainer.innerHTML = '';
                    window.removeEventListener('afterprint', cleanupAfterPrint);
                };

                window.addEventListener('afterprint', cleanupAfterPrint);
                window.print();

                setTimeout(cleanupAfterPrint, 1000);
            }

            function initialize() {
                // Input change listeners
                const inputsToWatch = [
                    'clientName', 'stateResidency', 'currentAge', 'retirementAge', 'iraBalance', 
                    'currentIncome', 'totalConversionAmount', 'conversionYears', 'preRetirementReturn', 
                    'postRetirementReturn', 'multiYearStrategy', 'conversionStrategy', 'payTaxesFrom', 
                    'maxTaxBracket', 'conversionAmount', 'capitalGainsRate', 'rmdAge', 
                    'includeSocialSecurity', 'socialSecurityBenefit', 'incomeGrowthRate',
                    'enableAssetDiscount', 'valuationDiscount', 'operationalReduction', 'discountStrategy',
                    'analysisYear'
                ];
                
                inputsToWatch.forEach(id => {
                    const element = document.getElementById(id);
                    if (element) {
                        element.addEventListener('input', function() {
                            console.log('Input changed:', id, 'value:', element.value);
                            calculateAndDisplay();
                        });
                        element.addEventListener('change', function() {
                            console.log('Change event:', id, 'value:', element.value);
                            calculateAndDisplay();
                        });
                    } else {
                        console.log('Element not found:', id);
                    }
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

                // Tab functionality
                document.querySelectorAll('.tab').forEach(tab => {
                    tab.addEventListener('click', (e) => {
                        const tabName = e.target.dataset.tab;
                        showTab(tabName);
                    });
                });

                // Button functionality
                document.getElementById('optimizeBtn').addEventListener('click', optimizeConversions);
                document.getElementById('generateReportBtn').addEventListener('click', generateReport);

                // Analysis year input is now handled by the main input system

                // Test if analysis year input exists
                setTimeout(() => {
                    const testInput = document.getElementById('analysisYear');
                    console.log('Test: Analysis year input exists?', !!testInput);
                    if (testInput) {
                        console.log('Test: Input value:', testInput.value);
                        console.log('Test: Input type:', testInput.type);
                        console.log('Test: Input in inputsToWatch?', inputsToWatch.includes('analysisYear'));
                    }
                }, 500);

                // Initialize calculations
                calculateAndDisplay();

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

        // Global function to update net advantage for a specific year
        window.updateNetAdvantageForYear = function(year) {
            console.log('updateNetAdvantageForYear called with year:', year);
            
            const selectedYear = parseInt(year);
            if (isNaN(selectedYear) || selectedYear < 1 || selectedYear > 45) {
                console.log('Invalid year:', year);
                return;
            }
            
            // Check if we have analysis data
            if (!window.analysisData || !window.analysisData.netAdvantage) {
                console.log('No analysis data available yet');
                return;
            }
            
            // Get net advantage for selected year
            const selectedYearAdvantage = window.analysisData.netAdvantage[selectedYear];
            if (selectedYearAdvantage === undefined) {
                console.log('No data for year:', selectedYear);
                return;
            }
            
            console.log('Updating net advantage to:', selectedYearAdvantage, 'for year:', selectedYear);
            
            // Find and update the net advantage metric card
            const metricCards = document.querySelectorAll('.metric-card');
            let updated = false;
            
            metricCards.forEach(card => {
                const label = card.querySelector('.metric-label');
                if (label && label.textContent.includes('Net Advantage at Year')) {
                    const valueElement = card.querySelector('.metric-value');
                    if (valueElement) {
                        // Format currency function
                        const formatCurrency = (v) => new Intl.NumberFormat('en-US', { 
                            style: 'currency', 
                            currency: 'USD', 
                            minimumFractionDigits: 0, 
                            maximumFractionDigits: 0 
                        }).format(v);
                        
                        valueElement.textContent = formatCurrency(selectedYearAdvantage);
                        valueElement.className = `metric-value ${selectedYearAdvantage >= 0 ? 'positive' : 'negative'}`;
                        label.textContent = `Net Advantage at Year ${selectedYear}`;
                        updated = true;
                        console.log('Successfully updated metric card');
                    }
                }
            });
            
            if (!updated) {
                console.log('Could not find net advantage metric card to update');
            }
        };

    function openPopup(url) {
    try {
        var popup = window.open(url, 'advisorGuide', 
            'width=500,height=800,scrollbars=yes,resizable=yes,toolbar=no,menubar=no,location=no,status=no'
        );
        
        // Check if popup was blocked
        if (!popup || popup.closed || typeof popup.closed == 'undefined') {
            alert('Popup blocked! Please allow popups for this site or the guide will open in a new tab.');
            return true; // Let the browser handle it normally
        }
        
        popup.focus();
        return false; // Prevent normal link behavior
    } catch (e) {
        return true; // Fallback to normal link behavior
    }
}
