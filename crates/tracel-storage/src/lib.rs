//! Local SQLite persistence and bounded system-observation queries.
mod intervals;
mod sqlite;
pub use intervals::{Interval, StateIntervals};
pub use sqlite::{ArchivePage, SqliteStore, StoredObservation};
use tracel_core::{MetricSample, TimeRange};

pub struct Migration {
    pub version: u32,
    pub sql: &'static str,
}

pub const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        sql: include_str!("../migrations/0001_system_samples.sql"),
    },
    Migration {
        version: 2,
        sql: include_str!("../migrations/0002_observations.sql"),
    },
    Migration {
        version: 3,
        sql: include_str!("../migrations/0003_activity.sql"),
    },
    Migration {
        version: 4,
        sql: include_str!("../migrations/0004_intervals.sql"),
    },
];

/// Implementations must apply migrations and commit batches atomically.
/// Range reads return overlapping observations, including missing samples.
pub trait MetricStore {
    type Error;
    fn write_batch(&mut self, samples: &[MetricSample]) -> Result<(), Self::Error>;
    fn read_range(&self, range: TimeRange) -> Result<Vec<MetricSample>, Self::Error>;
}
