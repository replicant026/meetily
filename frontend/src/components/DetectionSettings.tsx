'use client';

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface DetectionConfig {
  enabled: boolean;
  autoRecord: boolean;
  browserTitles: string[];
  minCallSeconds: number;
  graceSeconds: number;
}

const defaultConfig: DetectionConfig = {
  enabled: true,
  autoRecord: true,
  browserTitles: ['Meet', 'Microsoft Teams', 'Zoom', 'Webex'],
  minCallSeconds: 30,
  graceSeconds: 8,
};

export function DetectionSettings() {
  const [config, setConfig] = useState<DetectionConfig>(defaultConfig);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    invoke<DetectionConfig>('get_detection_config')
      .then((cfg) => {
        setConfig(cfg);
        setLoading(false);
      })
      .catch((e) => {
        console.error('Failed to load detection config:', e);
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    try {
      await invoke('set_detection_config', { config });
      toast.success('Detection settings saved');
    } catch (e) {
      console.error('Failed to save detection config:', e);
      toast.error('Failed to save detection settings');
    }
  };

  if (loading) {
    return <div className="p-4 text-sm text-gray-500">Loading detection settings...</div>;
  }

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <Radio className="h-5 w-5 text-gray-500" />
        <h3 className="text-lg font-medium">Auto-Detection</h3>
      </div>
      <p className="text-sm text-gray-500">
        Automatically detect when you join a meeting and optionally start recording.
      </p>

      {/* Enable/Disable */}
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium">Enable auto-detection</label>
          <p className="text-xs text-gray-500">Monitor microphone usage for meeting apps</p>
        </div>
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
          className="h-4 w-4 rounded"
        />
      </div>

      {/* Auto-record */}
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium">Auto-record</label>
          <p className="text-xs text-gray-500">Start recording when a meeting is detected</p>
        </div>
        <input
          type="checkbox"
          checked={config.autoRecord}
          onChange={(e) => setConfig({ ...config, autoRecord: e.target.checked })}
          className="h-4 w-4 rounded"
          disabled={!config.enabled}
        />
      </div>

      {/* Min call seconds */}
      <div>
        <label className="text-sm font-medium">Minimum call duration (seconds)</label>
        <p className="text-xs text-gray-500 mb-1">How long the mic must be active before detecting a meeting</p>
        <Input
          type="number"
          value={config.minCallSeconds}
          onChange={(e) => setConfig({ ...config, minCallSeconds: parseInt(e.target.value) || 30 })}
          className="w-24"
          min={5}
          max={300}
          disabled={!config.enabled}
        />
      </div>

      {/* Grace seconds */}
      <div>
        <label className="text-sm font-medium">Grace period (seconds)</label>
        <p className="text-xs text-gray-500 mb-1">Delay after mic stops before ending detection</p>
        <Input
          type="number"
          value={config.graceSeconds}
          onChange={(e) => setConfig({ ...config, graceSeconds: parseInt(e.target.value) || 8 })}
          className="w-24"
          min={0}
          max={60}
          disabled={!config.enabled}
        />
      </div>

      {/* Browser titles */}
      <div>
        <label className="text-sm font-medium">Meeting app titles</label>
        <p className="text-xs text-gray-500 mb-1">Window titles to look for (one per line)</p>
        <textarea
          value={config.browserTitles.join('\n')}
          onChange={(e) => setConfig({ ...config, browserTitles: e.target.value.split('\n').filter(Boolean) })}
          className="w-full h-24 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={!config.enabled}
        />
      </div>

      <div className="pt-2">
        <Button onClick={handleSave} size="sm">Save Settings</Button>
      </div>
    </div>
  );
}
