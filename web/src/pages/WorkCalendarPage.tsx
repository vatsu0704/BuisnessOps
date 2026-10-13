import { useCallback, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { IoAdd, IoSparklesOutline, IoTrashOutline } from 'react-icons/io5';
import { extractErrorMessage } from '@/api/client';
import { createHoliday, deleteHoliday, getWorkWeek, listHolidays, updateWorkWeek } from '@/api/workCalendar';
import fieldStyles from '@/components/branches/BranchFields.module.css';
import Card from '@/components/ui/Card';
import CheckChips from '@/components/ui/CheckChips';
import ChoiceTile from '@/components/ui/ChoiceTile';
import DateField from '@/components/ui/DateField';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import FormInput from '@/components/ui/FormInput';
import PageHeader from '@/components/ui/PageHeader';
import Pill from '@/components/ui/Pill';
import PrimaryButton from '@/components/ui/PrimaryButton';
import Spinner from '@/components/ui/Spinner';
import { useBusinessId } from '@/hooks/useBusinessId';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { pathTo } from '@/routes/paths';
import { step } from '@/theme/motion';
import type { Holiday, WorkWeek } from '@/types/staffing';
import { confirm } from '@/utils/confirm';
import { dateKeyFromApi, formatDateLong, todayISO, weekdayName } from '@/utils/date';
import styles from './WorkCalendarPage.module.css';

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

type Unmarked = WorkWeek['unmarkedWorkingDayStatus'];

/**
 * The weekly off and the holiday calendar — the app's Work calendar screen.
 *
 * These set the payroll divisor: working days = calendar days − week-offs −
 * holidays. Both are paid, which is why they come out of the divisor rather than
 * counting as days not worked — somebody present on every working day earns
 * exactly their salary.
 */
export default function WorkCalendarPage() {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const year = new Date().getFullYear();

  const [workWeek, setWorkWeek] = useState<WorkWeek | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [error, setError] = useState<string | null>(null);
  // One change to the week at a time, without greying the chips out on every click.
  const savingWeek = useRef(false);

  const [holidayDate, setHolidayDate] = useState(todayISO);
  const [holidayName, setHolidayName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    try {
      const [week, list] = await Promise.all([getWorkWeek(businessId), listHolidays(businessId, { year })]);
      setWorkWeek(week);
      setHolidays(list);
      setError(null);
    } catch (err) {
      // What was on the page stays on it.
      setError(extractErrorMessage(err));
    }
  }, [businessId, year]);

  useRefreshOnFocus(load);

  async function saveWeek(patch: { weeklyOffDays?: number[]; unmarkedWorkingDayStatus?: Unmarked }) {
    if (!businessId || !workWeek || savingWeek.current) return;
    // Shown at once; put back from the server if it refuses.
    setWorkWeek({ ...workWeek, ...patch });
    savingWeek.current = true;
    setError(null);
    try {
      await updateWorkWeek(businessId, patch);
    } catch (err) {
      setError(extractErrorMessage(err));
      await load();
    } finally {
      savingWeek.current = false;
    }
  }

  function toggleWeekday(day: number) {
    if (!workWeek) return;
    const offDays = workWeek.weeklyOffDays;
    const next = offDays.includes(day) ? offDays.filter((d) => d !== day) : [...offDays, day].sort((a, b) => a - b);
    // All seven would leave payroll nothing to divide by; the server refuses it.
    if (next.length === 7) return;
    void saveWeek({ weeklyOffDays: next });
  }

  async function handleAddHoliday(event: FormEvent) {
    event.preventDefault();
    if (!businessId || !holidayName.trim() || !holidayDate || isAdding) return;
    setIsAdding(true);
    setError(null);
    try {
      await createHoliday(businessId, { date: holidayDate, name: holidayName.trim() });
      setHolidayName('');
      await load();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsAdding(false);
    }
  }

  async function handleRemoveHoliday(holiday: Holiday) {
    if (!businessId) return;
    const date = formatDateLong(dateKeyFromApi(holiday.date), t);
    // Asks first: a holiday kept for one branch cannot be put back from here,
    // and either way it changes what payroll divides by.
    const confirmed = await confirm({
      title: t('web.workCalendar.removeTitle', { name: holiday.name }),
      body: t('web.workCalendar.removeBody', { date }),
      confirmLabel: t('workCalendar.deleteHoliday'),
      cancelLabel: t('common.cancel'),
    });
    if (!confirmed) return;
    setRemovingId(holiday.id);
    setError(null);
    try {
      await deleteHoliday(businessId, holiday.id);
      await load();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setRemovingId(null);
    }
  }

  const offCount = workWeek?.weeklyOffDays.length ?? 0;

  return (
    <div className={styles.page}>
      <PageHeader title={t('workCalendar.title')} backTo={pathTo('settings')} />

      {error ? <ErrorBanner key={error} message={error} /> : null}

      {!workWeek ? (
        error ? null : (
          <div className={styles.loading}>
            <Spinner size={24} />
          </div>
        )
      ) : (
        <div className={styles.grid}>
          <div className={styles.column}>
            <Enter delay={step(1)}>
              <Card title={t('workCalendar.weeklyOff')}>
                <CheckChips
                  label={t('workCalendar.weeklyOff')}
                  hideLabel
                  options={WEEKDAYS.map((day) => ({
                    value: day,
                    label: weekdayName(day, t),
                    disabled: offCount === 6 && !workWeek.weeklyOffDays.includes(day),
                  }))}
                  selected={workWeek.weeklyOffDays}
                  onToggle={toggleWeekday}
                />
                <p className={styles.hint}>
                  {offCount === 6 ? t('web.workCalendar.oneWorkingDay') : t('workCalendar.weeklyOffHint')}
                </p>
              </Card>
            </Enter>

            <Enter delay={step(2)}>
              <Card title={t('workCalendar.unmarkedTitle')}>
                <fieldset className={styles.choices}>
                  <legend className="visually-hidden">{t('workCalendar.unmarkedTitle')}</legend>
                  {(['PRESENT', 'ABSENT'] as const).map((status) => (
                    <ChoiceTile
                      key={status}
                      name="unmarked-working-day"
                      value={status}
                      title={status === 'PRESENT' ? t('workCalendar.unmarkedPresent') : t('workCalendar.unmarkedAbsent')}
                      selected={workWeek.unmarkedWorkingDayStatus === status}
                      onSelect={() => void saveWeek({ unmarkedWorkingDayStatus: status })}
                    />
                  ))}
                </fieldset>
                <p className={styles.hint}>{t('workCalendar.unmarkedHint')}</p>
              </Card>
            </Enter>
          </div>

          <div className={styles.column}>
            <Enter delay={step(3)}>
              <Card title={t('workCalendar.addHoliday')}>
                <form onSubmit={handleAddHoliday} noValidate>
                  <div className={fieldStyles.pair}>
                    <DateField
                      label={t('workCalendar.holidayDate')}
                      value={holidayDate}
                      onChange={setHolidayDate}
                      // A holiday is usually still to come, unlike an attendance mark.
                      max={`${year + 1}-12-31`}
                    />
                    <FormInput
                      label={t('workCalendar.holidayName')}
                      icon={IoSparklesOutline}
                      autoComplete="off"
                      value={holidayName}
                      onChange={(e) => setHolidayName(e.target.value)}
                    />
                  </div>
                  <PrimaryButton
                    type="submit"
                    block
                    title={t('workCalendar.addHoliday')}
                    icon={IoAdd}
                    loading={isAdding}
                    disabled={!holidayName.trim() || !holidayDate}
                  />
                </form>
              </Card>
            </Enter>

            <Enter delay={step(4)}>
              <Card title={t('workCalendar.holidays')}>
                {holidays.length === 0 ? (
                  <p className={styles.empty}>{t('workCalendar.noHolidays', { year })}</p>
                ) : (
                  <ul className={styles.list}>
                    {holidays.map((holiday) => (
                      <li key={holiday.id} className={styles.row}>
                        <div className={styles.rowMain}>
                          <div className={styles.rowText}>
                            <p className={styles.name}>{holiday.name}</p>
                            <p className={styles.meta}>{formatDateLong(dateKeyFromApi(holiday.date), t)}</p>
                          </div>
                          <Pill
                            label={holiday.branch ? holiday.branch.name : t('workCalendar.allBranches')}
                            tone="muted"
                            className={styles.pill}
                          />
                        </div>
                        <button
                          type="button"
                          className={styles.remove}
                          onClick={() => void handleRemoveHoliday(holiday)}
                          disabled={removingId === holiday.id}
                          aria-label={t('web.workCalendar.removeLabel', { name: holiday.name })}
                          title={t('workCalendar.deleteHoliday')}
                        >
                          {removingId === holiday.id ? <Spinner size={14} /> : <IoTrashOutline size={15} aria-hidden="true" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </Enter>
          </div>
        </div>
      )}
    </div>
  );
}
