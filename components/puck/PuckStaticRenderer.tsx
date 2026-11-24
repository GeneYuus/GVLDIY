// components/puck/PuckStaticRenderer.tsx
import React from 'react';
import { puckConfig, type ArchivePuckProps } from '@/lib/puck/puck.config';
import type { PuckSerializedData } from '@/types/archive';

type SerializedBlock = {
  type: string;
  props: Record<string, unknown>;
};

interface PuckStaticRendererProps {
  data: PuckSerializedData | null | undefined;
}

/**
 * Pure-React renderer for saved Puck slots and standalone /p/[slug] zine pages.
 * Keeps @puckeditor/core's drag-and-drop editor chunks isolated strictly to /admin/editor/[slug]
 * so public archive views load with minimal JS chunk fan-out.
 */
export default function PuckStaticRenderer({ data }: PuckStaticRendererProps) {
  if (!data || !Array.isArray(data.content) || data.content.length === 0) {
    return null;
  }

  const zones = data.zones || {};

  const renderBlockList = (
    items: SerializedBlock[],
    keyPrefix: string
  ): React.ReactNode => {
    return items.map((block, idx) => {
      if (!block || typeof block.type !== 'string') return null;
      const rawProps =
        block.props && typeof block.props === 'object' ? block.props : {};
      const blockId =
        typeof rawProps.id === 'string' && rawProps.id
          ? rawProps.id
          : `${keyPrefix}-${block.type}-${idx}`;

      if (block.type === 'TwoColumnLayout') {
        const def = puckConfig.components.TwoColumnLayout;
        const leftRaw = Array.isArray(rawProps.leftColumn)
          ? (rawProps.leftColumn as SerializedBlock[])
          : zones[`${blockId}:leftColumn`] || [];
        const rightRaw = Array.isArray(rawProps.rightColumn)
          ? (rawProps.rightColumn as SerializedBlock[])
          : zones[`${blockId}:rightColumn`] || [];

        const gapVal =
          rawProps.gap === '16px' ||
          rawProps.gap === '20px' ||
          rawProps.gap === '24px'
            ? rawProps.gap
            : def.defaultProps?.gap || '20px';

        type TwoColRenderProps = Parameters<typeof def.render>[0];
        const LeftSlot = (() => (
          <>{renderBlockList(leftRaw, `${blockId}-left`)}</>
        )) as unknown as TwoColRenderProps['leftColumn'];
        const RightSlot = (() => (
          <>{renderBlockList(rightRaw, `${blockId}-right`)}</>
        )) as unknown as TwoColRenderProps['rightColumn'];

        return (
          <React.Fragment key={blockId}>
            {def.render({
              gap: gapVal,
              leftColumn: LeftSlot,
              rightColumn: RightSlot,
              id: blockId,
              puck: {
                isEditing: false,
                dragRef: null,
                renderDropZone: () => null,
                metadata: {},
              },
            })}
          </React.Fragment>
        );
      }

      const compKey = block.type as Exclude<
        keyof ArchivePuckProps,
        'TwoColumnLayout'
      >;
      const compDef = puckConfig.components[compKey];
      if (!compDef) return null;

      const mergedProps = {
        ...(compDef.defaultProps || {}),
        ...rawProps,
        id: blockId,
        puck: {
          isEditing: false,
          dragRef: null,
          renderDropZone: () => null,
          metadata: {},
        },
      };

      const renderFn = compDef.render as unknown as (
        props: Record<string, unknown>
      ) => React.ReactNode;

      return (
        <React.Fragment key={blockId}>{renderFn(mergedProps)}</React.Fragment>
      );
    });
  };

  return <>{renderBlockList(data.content, 'root')}</>;
}
