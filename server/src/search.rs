use crate::labels;
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
            if [
                "from", "to", "subject", "is", "has", "in", "label", "category",
            ]
            .contains(&field)
            {
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
                "is" | "in" if system_label(value).is_some() => {
                    let label = system_label(value).expect("Checked above");
                    if value.eq_ignore_ascii_case("read") {
                        builder.push(" AND NOT ").push(labels::has(labels::UNREAD));
                    } else {
                        builder.push(" AND ").push(labels::has(label));
                    }
                }
                "has" if value == "attachment" => {
                    builder
                        .push(" AND EXISTS(SELECT 1 FROM attachments a WHERE a.message_id=m.id)");
                }
                "in" if value == "anywhere" => {}
                "in" if value == "all" => {
                    builder.push(" AND ").push(labels::visible());
                }
                "label" => {
                    // Gmail writes spaces in label names as hyphens in searches.
                    builder
                        .push(" AND EXISTS(SELECT 1 FROM message_labels ml JOIN labels l ON l.id=ml.label_id WHERE ml.message_id=m.id AND (l.name=")
                        .push_bind(value.clone())
                        .push(" OR l.name=")
                        .push_bind(value.replace('-', " "))
                        .push("))");
                }
                "category" if labels::category(value).is_some() => {
                    builder
                        .push(" AND ")
                        .push(labels::has(labels::category(value).expect("Checked above")));
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

/// Maps `is:`/`in:` keywords to system labels. `is:read` maps to UNREAD and is negated.
fn system_label(value: &str) -> Option<&'static str> {
    Some(match value.to_ascii_lowercase().as_str() {
        "unread" | "read" => labels::UNREAD,
        "starred" => labels::STARRED,
        "important" => labels::IMPORTANT,
        "inbox" => labels::INBOX,
        "sent" => labels::SENT,
        "spam" => labels::SPAM,
        "trash" => labels::TRASH,
        "snoozed" => labels::SNOOZED,
        _ => return None,
    })
}

/// Whether the search explicitly asks for spam or trash, which are hidden otherwise.
pub fn includes_hidden(terms: &[Term]) -> bool {
    terms.iter().any(|term| {
        matches!(term, Term::Field(field, value)
            if field == "in" && ["anywhere", "spam", "trash"].contains(&value.to_ascii_lowercase().as_str()))
    })
}
