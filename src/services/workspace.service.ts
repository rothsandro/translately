import { GlobPattern, workspace } from "vscode";

interface FindFilesOptions {
  include: GlobPattern;
  exclude: GlobPattern;
}

export class WorkspaceService {
  async findFiles(options: FindFilesOptions): Promise<string[]> {
    const results = await workspace.findFiles(options.include, options.exclude);
    const sortedFiles = results
      .map((result) => result.fsPath.toString())
      .sort((a, b) => a.localeCompare(b));

    return sortedFiles;
  }

  getRelativePathOf(file: string) {
    return workspace.asRelativePath(file);
  }
}
