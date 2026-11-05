import type { ApiAgentWorkspaceFile, ApiAgentWorkspaceSkill } from '../api/types';

export function getAgentWorkspaceSkills(files: ApiAgentWorkspaceFile[]): ApiAgentWorkspaceSkill[] {
  return files.flatMap(({ path, name: fileName, kind }) => {
    if (kind !== 'file' || !path.endsWith('/SKILL.md')) return [];

    const parts = path.split('/');
    const skillsDirectoryIndex = parts.slice(0, -2).lastIndexOf('skills');
    const name = fileName || parts.at(-2);
    if (skillsDirectoryIndex < 0 || skillsDirectoryIndex >= parts.length - 2 || !name) return [];

    return [{ path, name }];
  });
}
