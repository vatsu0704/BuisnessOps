import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IoBicycleOutline, IoPeopleOutline } from 'react-icons/io5';
import { extractErrorMessage } from '@/api/client';
import { listDeliveryAgents } from '@/api/supply';
import Button from '@/components/ui/Button';
import OptionRow from '@/components/ui/OptionRow';
import PrimaryButton from '@/components/ui/PrimaryButton';
import Spinner from '@/components/ui/Spinner';
import { useBusinessId } from '@/hooks/useBusinessId';
import type { DeliveryAgent } from '@/types/supply';
import { formatTime } from '@/utils/date';
import styles from './Panel.module.css';

/** `undefined` while the list is still loading and nothing is chosen yet; `null` is "nobody yet". */
type Choice = string | null | undefined;

/**
 * Who is taking this run — the warehouse desk's picker, the app's `AgentPicker`.
 *
 * The list comes from a supply endpoint under `supplyOrder:fulfil`, not the team
 * list: the desk holds no `team:view` and must not need it for its own job. A
 * name, a duty state and a count is all that comes back, and all this shows.
 *
 * **Availability is a caption, never a lock.** The freest agent sorts first and
 * is chosen already, but every agent stays selectable — the person at the desk
 * knows things the page does not.
 */
export default function AgentPicker({
  title,
  submitLabel,
  allowNobody,
  isBusy,
  onSubmit,
  onCancel,
}: {
  title: string;
  submitLabel: string;
  /** Dispatch may go out unassigned; a reassignment has to name somebody. */
  allowNobody: boolean;
  isBusy: boolean;
  onSubmit: (deliveryAgentMembershipId: string | null) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const [agents, setAgents] = useState<DeliveryAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [choice, setChoice] = useState<Choice>(undefined);

  useEffect(() => {
    if (!businessId) return;
    let live = true;
    setIsLoading(true);
    setLoadError(null);
    listDeliveryAgents(businessId)
      .then((found) => {
        if (!live) return;
        setAgents(found);
        // The server sorts the freest first, so the first row answers "who is
        // available" — chosen already, so the common case is one click.
        setChoice(found[0]?.membershipId ?? (allowNobody ? null : undefined));
      })
      .catch((err: unknown) => {
        if (live) setLoadError(extractErrorMessage(err));
      })
      .finally(() => {
        if (live) setIsLoading(false);
      });
    return () => {
      live = false;
    };
  }, [businessId, allowNobody]);

  function describe(agent: DeliveryAgent): string {
    const duty =
      agent.dutyState === 'ON_DUTY'
        ? t('supply.dutyOn', { time: formatTime(agent.onDutySince, t) })
        : agent.dutyState === 'OFF_DUTY'
          ? t('supply.dutyOff')
          : t('supply.dutyUnknown');
    const runs = agent.activeRuns === 0 ? t('supply.free') : t('supply.carrying', { count: agent.activeRuns });
    return `${duty} · ${runs}`;
  }

  return (
    <fieldset className={styles.panel}>
      <legend className="visually-hidden">{title}</legend>
      <p className={styles.title} aria-hidden="true">
        {title}
      </p>

      {isLoading ? <Spinner size={20} /> : null}
      {loadError ? <p className={styles.error}>{loadError}</p> : null}
      {!isLoading && !loadError && agents.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>{t('supply.noAgents')}</p>
          <p className={styles.emptyBody}>{t('supply.noAgentsBody')}</p>
        </div>
      ) : null}

      <div className={styles.options}>
        {agents.map((agent) => (
          <OptionRow
            key={agent.membershipId}
            name="supply-agent"
            value={agent.membershipId}
            icon={IoBicycleOutline}
            title={agent.name ?? t('supply.assignUnnamed')}
            description={describe(agent)}
            selected={choice === agent.membershipId}
            onSelect={() => setChoice(agent.membershipId)}
          />
        ))}
        {allowNobody && !isLoading ? (
          <OptionRow
            name="supply-agent"
            value=""
            icon={IoPeopleOutline}
            title={t('supply.assignNobody')}
            description={t('supply.assignNobodyHint')}
            selected={choice === null}
            onSelect={() => setChoice(null)}
          />
        ) : null}
      </div>

      <div className={styles.actions}>
        <Button title={t('common.cancel')} onClick={onCancel} disabled={isBusy} />
        <PrimaryButton
          title={submitLabel}
          icon={IoBicycleOutline}
          loading={isBusy}
          disabled={choice === undefined}
          onClick={() => onSubmit(choice ?? null)}
        />
      </div>
    </fieldset>
  );
}
