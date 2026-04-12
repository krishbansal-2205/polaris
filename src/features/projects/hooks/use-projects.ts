import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';

export const useProject = (projectId: Id<'projects'>) => {
   return useQuery(api.projects.getById, { id: projectId });
};

export const useProjects = () => {
   return useQuery(api.projects.get);
};

export const useProjectsPartial = (limit: number) => {
   return useQuery(api.projects.getPartial, { limit });
};

export const useCreateProject = () => {
   return useMutation(api.projects.create);
};

export const useRenameProject = () => {
   return useMutation(api.projects.rename);
};

export const useUpdateProjectSettings = () => {
   return useMutation(api.projects.updateSettings);
};
