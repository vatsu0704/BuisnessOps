import { settleConfirm, useConfirmStore } from '@/utils/confirm';
import Button from './Button';
import Dialog from './Dialog';
import PrimaryButton from './PrimaryButton';

/** Renders whatever `confirm()` is currently asking. Mounted once, in App. */
export default function ConfirmHost() {
  const pending = useConfirmStore((s) => s.pending);
  const options = pending?.options;

  return (
    <Dialog
      open={!!pending}
      title={options?.title ?? ''}
      onClose={() => settleConfirm(false)}
      footer={
        options ? (
          <>
            <Button title={options.cancelLabel} onClick={() => settleConfirm(false)} />
            {options.destructive === false ? (
              <PrimaryButton title={options.confirmLabel} onClick={() => settleConfirm(true)} />
            ) : (
              <Button variant="dangerSolid" title={options.confirmLabel} onClick={() => settleConfirm(true)} />
            )}
          </>
        ) : null
      }
    >
      {options?.body}
    </Dialog>
  );
}
