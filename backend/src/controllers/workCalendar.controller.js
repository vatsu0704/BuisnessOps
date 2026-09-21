const workCalendarService = require('../services/workCalendar.service');
const { validateWorkWeek, validateHoliday } = require('../validations/workCalendar.validation');

async function getWorkWeek(req, res, next) {
  try {
    res.json(await workCalendarService.getWorkWeek(req.tenant.businessId));
  } catch (err) {
    next(err);
  }
}

async function updateWorkWeek(req, res, next) {
  try {
    const errors = validateWorkWeek(req.body);
    if (errors.length) return res.status(400).json({ message: 'Validation failed', errors });

    res.json(await workCalendarService.updateWorkWeek(req.tenant.businessId, req.body));
  } catch (err) {
    next(err);
  }
}

async function listHolidays(req, res, next) {
  try {
    const year = req.query.year ? Number(req.query.year) : undefined;
    if (req.query.year && (!Number.isInteger(year) || year < 2000 || year > 2100)) {
      return res.status(400).json({ message: 'Validation failed', errors: ['year must be a 4-digit number'] });
    }
    const holidays = await workCalendarService.listHolidays(req.tenant.businessId, {
      year,
      branchId: req.query.branchId,
      accessibleBranchIds: req.branchAccess,
    });
    res.json(holidays);
  } catch (err) {
    next(err);
  }
}

async function createHoliday(req, res, next) {
  try {
    const errors = validateHoliday(req.body);
    if (errors.length) return res.status(400).json({ message: 'Validation failed', errors });

    const holiday = await workCalendarService.createHoliday(req.tenant.businessId, req.body);
    res.status(201).json(holiday);
  } catch (err) {
    next(err);
  }
}

async function deleteHoliday(req, res, next) {
  try {
    res.json(await workCalendarService.deleteHoliday(req.tenant.businessId, req.params.holidayId));
  } catch (err) {
    next(err);
  }
}

module.exports = { getWorkWeek, updateWorkWeek, listHolidays, createHoliday, deleteHoliday };
