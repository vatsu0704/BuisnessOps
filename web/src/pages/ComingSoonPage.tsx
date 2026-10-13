import { useTranslation } from 'react-i18next';
import type { IconType } from 'react-icons';
import NoticePage from './NoticePage';

type Props = {
  icon: IconType;
  /** The feature's name, already translated. */
  title: string;
};

/**
 * Where a page the mobile app has, and the web does not yet, will go. The route
 * is real so the navigation is the finished one; the page replaces this as it
 * is ported (see the web track in Docs/PROJECT_FLOW.md).
 */
export default function ComingSoonPage({ icon, title }: Props) {
  const { t } = useTranslation();
  return <NoticePage icon={icon} title={title} badge={t('web.comingSoon.badge')} body={t('web.comingSoon.body')} />;
}
