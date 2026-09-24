const express = require('express');
const workCalendarController = require('../controllers/workCalendar.controller');
const { requireAuth } = require('../middleware/auth');
const { resolveTenant } = require('../middleware/tenant');
const { requirePermission } = require('../middleware/rbac');

const router = express.Router();

const scoped = express.Router({ mergeParams: true });
scoped.use(requireAuth, resolveTenant);

// Reading the calendar is open to any member — everyone needs to know which
// days are week-offs and holidays, not least so the punch card doesn't nag
// someone on their day off. Changing it sets the payroll divisor, so it is
// OWNER/ADMIN only.
scoped.get('/work-week', workCalendarController.getWorkWeek);
scoped.patch('/work-week', requirePermission('workCalendar:manage'), workCalendarController.updateWorkWeek);

scoped.get('/holidays', workCalendarController.listHolidays);
scoped.post('/holidays', requirePermission('workCalendar:manage'), workCalendarController.createHoliday);
scoped.delete('/holidays/:holidayId', requirePermission('workCalendar:manage'), workCalendarController.deleteHoliday);

router.use('/:businessId', scoped);

module.exports = router;
