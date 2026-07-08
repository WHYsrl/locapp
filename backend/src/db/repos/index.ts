import type { Db } from '../client.js';
import { createUsersRepo, type UsersRepo } from './usersRepo.js';
import { createLocationsRepo, type LocationsRepo } from './locationsRepo.js';
import { createProjectsRepo, type ProjectsRepo } from './projectsRepo.js';
import { createRegistryRepo, type RegistryRepo } from './registryRepo.js';
import { createTagsRepo, type TagsRepo } from './tagsRepo.js';
import { createIngestionRepo, type IngestionRepo } from './ingestionRepo.js';
import { createExportJobsRepo, type ExportJobsRepo } from './exportJobsRepo.js';
import { createSearchRepo, type SearchRepo } from './searchRepo.js';

export interface Repos {
  users: UsersRepo;
  locations: LocationsRepo;
  projects: ProjectsRepo;
  registry: RegistryRepo;
  tags: TagsRepo;
  ingestion: IngestionRepo;
  exportJobs: ExportJobsRepo;
  search: SearchRepo;
}

export function createRepos(db: Db): Repos {
  return {
    users: createUsersRepo(db),
    locations: createLocationsRepo(db),
    projects: createProjectsRepo(db),
    registry: createRegistryRepo(db),
    tags: createTagsRepo(db),
    ingestion: createIngestionRepo(db),
    exportJobs: createExportJobsRepo(db),
    search: createSearchRepo(db),
  };
}
