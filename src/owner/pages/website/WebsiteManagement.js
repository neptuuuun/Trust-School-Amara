import React, { useEffect, useState } from 'react';
import { Image, Phone, Share2, Building2, LayoutGrid, Globe } from 'lucide-react';
import { getWebsiteSettings } from '../../../services/websiteService';
import { LoadingState, Alert } from '../../../components/ui/feedback';
import { useWebsiteSettings } from '../../../contexts/WebsiteSettingsContext';
import HeroSettings from './HeroSettings';
import ContactSettings from './ContactSettings';
import SocialSettings from './SocialSettings';
import BranchSettings from './BranchSettings';
import GallerySettings from './GallerySettings';

const TABS = [
  { id: 'hero',     label: 'القسم الرئيسي', icon: Image,      Component: HeroSettings },
  { id: 'contact',  label: 'معلومات الاتصال', icon: Phone,     Component: ContactSettings },
  { id: 'social',   label: 'وسائل التواصل',  icon: Share2,     Component: SocialSettings },
  { id: 'branches', label: 'الفروع',         icon: Building2,   Component: BranchSettings },
  { id: 'gallery',  label: 'معرض الصور',     icon: LayoutGrid,  Component: GallerySettings },
];

/**
 * WebsiteManagement — Owner-only control center for the PUBLIC website content.
 * Loads `config/website` once and shares it across tabs; each tab persists its
 * own section through the owner backend and reports the saved value back so the
 * in-memory copy stays fresh without a re-fetch.
 */
const WebsiteManagement = () => {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('hero');
  // Lets a successful save immediately refresh the PUBLIC site context, so the
  // owner's own view of /home reflects the change without a reload.
  const { refresh: refreshPublicSite } = useWebsiteSettings();

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getWebsiteSettings();
      setSettings(res?.settings || null);
    } catch (e) {
      setError(e.message || 'تعذّر تحميل إعدادات الموقع');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Merge a saved section back into the shared settings object, then refresh the
  // public-site context so the live homepage reflects the change immediately.
  const patchSection = (section, value) => {
    setSettings((prev) => ({ ...(prev || {}), [section]: value }));
    refreshPublicSite();
  };

  const Active = TABS.find((t) => t.id === tab)?.Component || HeroSettings;

  return (
    <div dir="rtl" className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
          <Globe className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">إدارة الموقع</h1>
          <p className="mt-0.5 text-sm text-gray-500">تحكّم في محتوى الموقع العام — تُطبَّق التغييرات مباشرةً بعد الحفظ.</p>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-px">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors
                ${active ? 'border-b-2 border-primary text-primary' : 'text-gray-500 hover:text-gray-800'}`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {loading && <LoadingState label="جاري تحميل إعدادات الموقع..." />}
      {error && !loading && <Alert variant="danger">{error}</Alert>}

      {!loading && !error && settings && (
        <Active settings={settings} onSaved={patchSection} />
      )}
    </div>
  );
};

export default WebsiteManagement;
