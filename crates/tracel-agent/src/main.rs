//! One-shot collector smoke tools. The desktop currently owns the sampling lifecycle.
use tracel_agent::{CollectionSettings, NativeReader, Sampler};

fn main() {
    let now = || {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
    };
    match std::env::args().nth(1).as_deref() {
        Some("--sample") => {
            let settings = CollectionSettings { enabled: true, cpu: true, ram: true };
            let mut sampler = Sampler::default(); let mut reader = NativeReader;
            sampler.sample(&settings, &mut reader, now());
            std::thread::sleep(std::time::Duration::from_secs(2));
            println!("{}", serde_json::to_string_pretty(&sampler.sample(&settings, &mut reader, now())).unwrap());
        }
        Some("--foreground") => match tracel_agent::foreground_info(now()) {
            Ok(info) => println!("{}", serde_json::to_string_pretty(&info).unwrap()),
            Err(error) => { eprintln!("{error}"); std::process::exit(1); }
        },
        _ => println!("Tracel collector tools: --sample (one CPU/RAM observation after 2 seconds), --foreground (one window snapshot). No persistent agent service is started."),
    }
}
