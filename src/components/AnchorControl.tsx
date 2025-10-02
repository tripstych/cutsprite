import React from 'react';
import type { Anchor, AnchorPresetKey } from '../types';
import { ANCHOR_PRESETS } from '../types';

interface AnchorControlProps {
  anchor: Anchor;
  onChange: (anchor: Anchor) => void;
  label: string;
  isInherited?: boolean;
}

export const AnchorControl: React.FC<AnchorControlProps> = ({ 
  anchor, 
  onChange, 
  label, 
  isInherited = false 
}) => {
  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const presetKey = e.target.value as AnchorPresetKey;
    if (presetKey && ANCHOR_PRESETS[presetKey]) {
      onChange(ANCHOR_PRESETS[presetKey]);
    }
  };

  const handleInputChange = (axis: 'x' | 'y', value: string) => {
    const numValue = Math.max(0, Math.min(1, parseFloat(value) || 0));
    onChange({ ...anchor, [axis]: numValue });
  };

  const getPresetKey = (): AnchorPresetKey | '' => {
    for (const [key, preset] of Object.entries(ANCHOR_PRESETS) as [AnchorPresetKey, Anchor][]) {
      if (Math.abs(preset.x - anchor.x) < 0.001 && Math.abs(preset.y - anchor.y) < 0.001) {
        return key;
      }
    }
    return '';
  };

  return (
    <div className={`anchor-control ${isInherited ? 'inherited' : ''}`}>
      <div className="anchor-label">
        {label} {isInherited && <span className="inherited-indicator">(inherited)</span>}
      </div>
      
      <div className="anchor-inputs">
        <div className="anchor-input-group">
          <label>X:</label>
          <input
            type="number"
            min="0"
            max="1"
            step="0.1"
            value={anchor.x.toFixed(2)}
            onChange={(e) => handleInputChange('x', e.target.value)}
            className="anchor-input"
          />
        </div>
        <div className="anchor-input-group">
          <label>Y:</label>
          <input
            type="number"
            min="0"
            max="1"
            step="0.1"
            value={anchor.y.toFixed(2)}
            onChange={(e) => handleInputChange('y', e.target.value)}
            className="anchor-input"
          />
        </div>
      </div>

      <div className="anchor-preset">
        <label>Preset:</label>
        <select 
          value={getPresetKey()} 
          onChange={handlePresetChange}
          className="anchor-preset-select"
        >
          <option value="">Custom</option>
          <option value="TOP_LEFT">Top Left</option>
          <option value="TOP_CENTER">Top Center</option>
          <option value="TOP_RIGHT">Top Right</option>
          <option value="CENTER_LEFT">Center Left</option>
          <option value="CENTER">Center</option>
          <option value="CENTER_RIGHT">Center Right</option>
          <option value="BOTTOM_LEFT">Bottom Left</option>
          <option value="BOTTOM_CENTER">Bottom Center</option>
          <option value="BOTTOM_RIGHT">Bottom Right</option>
        </select>
      </div>

      <div className="anchor-visual">
        <div className="anchor-grid">
          {Array.from({ length: 9 }, (_, i) => {
            const x = (i % 3) * 0.5;
            const y = Math.floor(i / 3) * 0.5;
            const isActive = Math.abs(anchor.x - x) < 0.1 && Math.abs(anchor.y - y) < 0.1;
            return (
              <div
                key={i}
                className={`anchor-point ${isActive ? 'active' : ''}`}
                onClick={() => onChange({ x, y })}
                style={{
                  left: `${x * 100}%`,
                  top: `${y * 100}%`
                }}
              />
            );
          })}
          <div
            className="anchor-custom-point"
            style={{
              left: `${anchor.x * 100}%`,
              top: `${anchor.y * 100}%`
            }}
          />
        </div>
      </div>
    </div>
  );
};