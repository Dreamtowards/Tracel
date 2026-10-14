//! Interactive-user agent entry point. No collectors or background service yet.
use tracel_core::Subject;

fn main() {
    println!(
        "Tracel agent scaffold: {:?} metrics; {} draft storage migration(s).",
        Subject::System,
        tracel_storage::MIGRATIONS.len()
    );
    println!("No collection started. Native Windows collectors are not implemented.");
}
