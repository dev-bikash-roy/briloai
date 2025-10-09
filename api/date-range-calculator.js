/**
 * DateRangeCalculator - Utility class for calculating historical date ranges
 * and performing date comparisons for filtering releases
 */
class DateRangeCalculator {
  /**
   * Calculate start and end dates for historical periods
   * @param {number} weeksBack - Number of weeks to go back (default: 2)
   * @returns {Object} Object with startDate and endDate as Date objects
   */
  getHistoricalRange(weeksBack = 2) {
    // Validate weeks_back parameter bounds (Requirements 4.1, 4.3)
    const validatedWeeksBack = this.validateWeeksBack(weeksBack);
    
    const now = new Date();
    
    // For historical data, we want a range that's entirely in the past
    // End date should be "now" (or slightly before to avoid edge cases)
    const endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);
    
    // Calculate start date by going back the specified number of weeks from now
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - (validatedWeeksBack * 7));
    startDate.setHours(0, 0, 0, 0);
    
    return {
      startDate,
      endDate,
      weeksBack: validatedWeeksBack
    };
  }

  /**
   * Check if a release date is within the specified date range
   * @param {string|Date} releaseDate - Release date to check (ISO string or Date object)
   * @param {Date} startDate - Start of the range
   * @param {Date} endDate - End of the range
   * @returns {boolean} True if the date is within range
   */
  isWithinRange(releaseDate, startDate, endDate) {
    if (!releaseDate || !startDate || !endDate) {
      return false;
    }

    const date = this.parseDate(releaseDate);
    if (!date) {
      return false;
    }

    return date >= startDate && date <= endDate;
  }

  /**
   * Format date string for comparison, handling various date formats
   * @param {string|Date} dateString - Date to format
   * @returns {Date|null} Parsed Date object or null if invalid
   */
  formatDateForComparison(dateString) {
    return this.parseDate(dateString);
  }

  /**
   * Parse date from various formats (ISO string, Date object, etc.)
   * @param {string|Date} dateInput - Date input to parse
   * @returns {Date|null} Parsed Date object or null if invalid
   */
  parseDate(dateInput) {
    if (!dateInput) {
      return null;
    }

    // If already a Date object
    if (dateInput instanceof Date) {
      return isNaN(dateInput.getTime()) ? null : dateInput;
    }

    // If it's a string, try to parse it
    if (typeof dateInput === 'string') {
      const parsed = new Date(dateInput);
      return isNaN(parsed.getTime()) ? null : parsed;
    }

    return null;
  }

  /**
   * Validate weeks_back parameter and apply bounds
   * @param {number} weeksBack - Number of weeks to validate
   * @returns {number} Validated weeks_back value
   */
  validateWeeksBack(weeksBack) {
    // Convert to number if it's a string
    const numWeeks = typeof weeksBack === 'string' ? parseInt(weeksBack, 10) : weeksBack;
    
    // If invalid, default to 2 weeks (Requirements 4.1, 4.3)
    if (isNaN(numWeeks) || numWeeks < 1) {
      return 2;
    }

    // Set reasonable upper bound to prevent excessive historical fetching
    // Maximum of 12 weeks (3 months) to prevent abuse
    if (numWeeks > 12) {
      return 12;
    }

    return numWeeks;
  }

  /**
   * Calculate the date range for filtering historical releases
   * @param {number} weeksBack - Number of weeks to go back
   * @returns {Object} Object with formatted start and end dates for filtering
   */
  calculateDateRange(weeksBack = 2) {
    const range = this.getHistoricalRange(weeksBack);
    
    return {
      startDate: range.startDate,
      endDate: range.endDate,
      startDateISO: range.startDate.toISOString(),
      endDateISO: range.endDate.toISOString(),
      weeksBack: range.weeksBack
    };
  }

  /**
   * Filter an array of releases by date range
   * @param {Array} releases - Array of release objects
   * @param {Date} startDate - Start date for filtering
   * @param {Date} endDate - End date for filtering
   * @returns {Array} Filtered array of releases within the date range
   */
  filterByDateRange(releases, startDate, endDate) {
    if (!Array.isArray(releases)) {
      return [];
    }

    return releases.filter(release => {
      return this.isWithinRange(release.release_date, startDate, endDate);
    });
  }

  /**
   * Check if a date has already passed (is historical)
   * @param {string|Date} releaseDate - Release date to check
   * @returns {boolean} True if the date is in the past
   */
  isHistoricalDate(releaseDate) {
    const date = this.parseDate(releaseDate);
    if (!date) {
      return false;
    }

    const now = new Date();
    return date < now;
  }

  /**
   * Get a human-readable description of the date range
   * @param {number} weeksBack - Number of weeks back
   * @returns {string} Human-readable description
   */
  getDateRangeDescription(weeksBack = 2) {
    const validatedWeeks = this.validateWeeksBack(weeksBack);
    const range = this.getHistoricalRange(validatedWeeks);
    
    const startStr = range.startDate.toLocaleDateString();
    const endStr = range.endDate.toLocaleDateString();
    
    if (validatedWeeks === 1) {
      return `Past week (${startStr} - ${endStr})`;
    } else {
      return `Past ${validatedWeeks} weeks (${startStr} - ${endStr})`;
    }
  }
}

export default DateRangeCalculator;