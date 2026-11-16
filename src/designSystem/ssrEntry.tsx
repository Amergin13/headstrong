import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DesignSystemApp } from './DesignSystemApp';

/**
 * Renders the live DesignSystemApp React component tree to static HTML markup so the standalone
 * local `design-system.html` file mirrors the real product components even when opened via file://.
 */
export function renderDesignSystemMarkup(): string {
  return renderToStaticMarkup(<DesignSystemApp />);
}
