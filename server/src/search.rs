use anyhow::{Result, bail};
use sqlx::{QueryBuilder, Sqlite};

#[derive(Debug, PartialEq)]
pub enum Term {
    Text(String),
    Field(String, String),
    Before(i64),
    After(i64),
}

pub fn parse(query: &str) -> Result<Vec<Term>> {
    let mut words = Vec::new();
    let mut word = String::new();
    let mut quoted = false;
    for c in query.chars() {
        match c {
            '"' => quoted = !quoted,
            c if c.is_whitespace() && !quoted => {
                if !word.is_empty() {
                    words.push(std::mem::take(&mut word));
                }
            }
            _ => word.push(c),
        }
    }
    if !word.is_empty() {
        words.push(word);
    }
    let mut result = Vec::new();
    for word in words {
        if let Some((field, value)) = word.split_once(':') {
            if ["from", "to", "subject", "is", "has", "in"].contains(&field) {
                result.push(Term::Field(field.into(), value.into()));
                continue;
            }
            if field == "before" || field == "after" {
                let date = chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d")?
                    .and_hms_opt(0, 0, 0)
                    .expect("Valid midnight")
                    .and_utc()
                    .timestamp_millis();
                result.push(if field == "before" {
                    Term::Before(date)
                } else {
                    Term::After(date)
                });
                continue;
            }
        }
        result.push(Term::Text(word));
    }
    if result.len() > 50 {
        bail!("Use at most 50 search terms");
    }
    Ok(result)
}

pub fn append(builder: &mut QueryBuilder<'_, Sqlite>, terms: &[Term]) {
    let mut texts = Vec::new();
    for term in terms {
        match term {
            Term::Text(text) => texts.push(format!("\"{}\"", text.replace('"', "\"\""))),
            Term::Before(date) => {
                builder.push(" AND m.received_at < ").push_bind(*date);
            }
            Term::After(date) => {
                builder.push(" AND m.received_at >= ").push_bind(*date);
            }
            Term::Field(field, value) => match field.as_str() {
                "from" => {
                    builder
                        .push(" AND (m.sender LIKE ")
                        .push_bind(format!("%{value}%"))
                        .push(" OR m.sender_email LIKE ")
                        .push_bind(format!("%{value}%"))
                        .push(")");
                }
                "to" => {
                    builder
                        .push(" AND (m.recipients LIKE ")
                        .push_bind(format!("%{value}%"))
                        .push(" OR m.envelope_to LIKE ")
                        .push_bind(format!("%{value}%"))
                        .push(")");
                }
                "subject" => {
                    builder
                        .push(" AND m.subject LIKE ")
                        .push_bind(format!("%{value}%"));
                }
                "is" if value == "unread" => {
                    builder.push(" AND m.is_read=0");
                }
                "is" if value == "read" => {
                    builder.push(" AND m.is_read=1");
                }
                "is" if value == "starred" => {
                    builder.push(" AND m.starred=1");
                }
                "is" if value == "important" => {
                    builder.push(" AND m.important=1");
                }
                "has" if value == "attachment" => {
                    builder
                        .push(" AND EXISTS(SELECT 1 FROM attachments a WHERE a.message_id=m.id)");
                }
                "in" if value == "anywhere" => {}
                "in" if value == "sent" => {
                    builder.push(" AND m.is_sent=1 AND m.folder NOT IN ('spam','trash')");
                }
                "in" if value == "all" => {
                    builder.push(" AND m.folder NOT IN ('spam','trash')");
                }
                "in" => {
                    builder.push(" AND m.folder=").push_bind(value.clone());
                }
                _ => {
                    builder.push(" AND 0=1");
                }
            },
        }
    }
    if !texts.is_empty() {
        builder
            .push(" AND m.rowid IN (SELECT rowid FROM message_search WHERE message_search MATCH ")
            .push_bind(texts.join(" AND "))
            .push(")");
    }
}
