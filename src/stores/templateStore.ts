/**
 * templateStore.ts
 *
 * Zustand store for recurring-bill templates, keyed by tripId (Phase 5).
 * Pure in-memory state — templates are an online feature and always
 * refetched on screen open; no SQLite mirror needed.
 */

import { create } from 'zustand';
import type { ExpenseTemplate } from '../types/domain';

interface TemplateState {
    templates: Record<string, ExpenseTemplate[]>;
    isLoading: boolean;

    setTemplates: (tripId: string, templates: ExpenseTemplate[]) => void;
    upsertTemplate: (template: ExpenseTemplate) => void;
    removeTemplate: (tripId: string, templateId: string) => void;
    setLoading: (v: boolean) => void;
}

const EMPTY_TEMPLATES: ExpenseTemplate[] = [];

export const useTemplateStore = create<TemplateState>((set) => ({
    templates: {},
    isLoading: false,

    setTemplates: (tripId, templates) =>
        set((s) => ({ templates: { ...s.templates, [tripId]: templates } })),

    upsertTemplate: (template) =>
        set((s) => {
            const bucket = s.templates[template.tripId] ?? [];
            const without = bucket.filter((t) => t.id !== template.id);
            // Keep creation order stable (createdAt asc).
            const next = [...without, template].sort((a, b) =>
                a.createdAt < b.createdAt ? -1 : 1,
            );
            return { templates: { ...s.templates, [template.tripId]: next } };
        }),

    removeTemplate: (tripId, templateId) =>
        set((s) => ({
            templates: {
                ...s.templates,
                [tripId]: (s.templates[tripId] ?? []).filter((t) => t.id !== templateId),
            },
        })),

    setLoading: (v) => set({ isLoading: v }),
}));

export { EMPTY_TEMPLATES };