mod common;
use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode},
};
use common::*;
use http_body_util::BodyExt;
use mailthing::{api, db};
use serde_json::{Value, json};
use tower::ServiceExt;

async fn request(app: &Router, method: &str, path: &str, data: Value) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(method)
                .uri(path)
                .header("content-type", "application/json")
                .body(Body::from(data.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (status, serde_json::from_slice(&bytes).unwrap())
}

#[tokio::test]
async fn label_management_persists_pins_and_updates_guidance_without_losing_mail_or_examples() {
    let (_temp, state) = setup().await;
    let thread = deliver(
        &state,
        mail("Project notes", "label-edit", "Plans for the team"),
    )
    .await;
    let app = api::router(state.clone());
    let mut events = state.events.subscribe();
    let (status, label) = request(
        &app,
        "POST",
        "/api/labels",
        json!({"name":" Work ","color":"#777d88"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(label["pinned"], true);
    assert_eq!(label["name"], "Work");
    events.try_recv().unwrap();
    let path = format!("/api/labels/{}", label["id"].as_str().unwrap());
    assert_eq!(
        request(
            &app,
            "POST",
            "/api/actions",
            json!({"thread_ids":[thread],"action":"label","value":label["id"]})
        )
        .await
        .0,
        StatusCode::OK
    );
    let detail = request(&app, "GET", &path, json!(null)).await.1;
    assert_eq!(detail["guidance"], "");
    assert_eq!(detail["example_count"], 1);
    let update = json!({"name":" Projects ","color":"#879988","pinned":false,"guidance":" Team discussions "});
    assert_eq!(
        request(&app, "PUT", &path, update.clone()).await.0,
        StatusCode::OK
    );
    let detail = request(&app, "GET", &path, json!(null)).await.1;
    assert_eq!(detail["name"], "Projects");
    assert_eq!(detail["color"], "#879988");
    assert_eq!(detail["pinned"], false);
    assert_eq!(detail["guidance"], "Team discussions");
    assert_eq!(detail["example_count"], 1);
    let settings = request(&app, "GET", "/api/settings", json!(null)).await.1;
    let shared = settings["labels"]
        .as_array()
        .unwrap()
        .iter()
        .find(|l| l["id"] == label["id"])
        .unwrap();
    assert_eq!(shared["pinned"], false);
    let conversation = request(&app, "GET", &format!("/api/threads/{thread}"), json!(null))
        .await
        .1;
    assert!(
        conversation["labels"]
            .as_array()
            .unwrap()
            .iter()
            .any(|l| l["id"] == label["id"] && l["name"] == "Projects")
    );
    for invalid in [
        json!({"name":"inbox"}),
        json!({"name":""}),
        json!({"name":"a\nb"}),
        json!({"name":"é".repeat(26)}),
        json!({"color":"#gggggg"}),
        json!({"guidance":"x".repeat(2001)}),
    ] {
        let mut body = update.clone();
        for (key, value) in invalid.as_object().unwrap() {
            body[key] = value.clone();
        }
        assert_eq!(
            request(&app, "PUT", &path, body).await.0,
            StatusCode::BAD_REQUEST
        );
    }
    assert_eq!(request(&app, "GET", &path, json!(null)).await.1, detail);
    assert_eq!(
        request(&app, "PUT", "/api/labels/INBOX", update.clone())
            .await
            .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        request(&app, "PUT", "/api/labels/missing", update).await.0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        request(&app, "GET", "/api/labels/INBOX", json!(null))
            .await
            .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        request(
            &app,
            "PUT",
            &path,
            json!({"name":"Projects","color":"#879988","pinned":true})
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        request(&app, "GET", &path, json!(null)).await.1["guidance"],
        "Team discussions"
    );
    sqlx::query("INSERT INTO rules(id,name,field,contains,action,value) VALUES('label-rule','Projects','from','team','label',?)")
        .bind(label["id"].as_str().unwrap()).execute(&state.pool).await.unwrap();
    assert_eq!(
        request(&app, "DELETE", &path, json!(null)).await.0,
        StatusCode::OK
    );
    assert_eq!(
        request(&app, "GET", &path, json!(null)).await.0,
        StatusCode::NOT_FOUND
    );
    let conversation = request(&app, "GET", &format!("/api/threads/{thread}"), json!(null))
        .await
        .1;
    assert_eq!(conversation["messages"].as_array().unwrap().len(), 1);
    assert!(
        !conversation["labels"]
            .as_array()
            .unwrap()
            .iter()
            .any(|l| l["id"] == label["id"])
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM rules WHERE id='label-rule'")
            .fetch_one(&state.pool)
            .await
            .unwrap(),
        0
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM sorting_examples")
            .fetch_one(&state.pool)
            .await
            .unwrap(),
        0
    );
}

#[tokio::test]
async fn restores_legacy_html_from_raw_without_mutating_or_exposing_raw_mail() {
    let (_temp, state) = setup().await;
    let raw = b"From: Sam <sam@example.net>\r\nSubject: A saved offer\r\nContent-Type: text/html\r\n\r\n<div style=\"display:none\">hidden padding</div><table width=\"600\"><tr><td style=\"color:red\">Offer<img src=\"https://images.example/item.png\"></td></tr></table>".to_vec();
    let thread = deliver(&state, raw).await;
    sqlx::query("UPDATE messages SET html='<p>Old stripped HTML</p>' WHERE thread_id=?")
        .bind(&thread)
        .execute(&state.pool)
        .await
        .unwrap();
    let (_, body) = request(
        &api::router(state.clone()),
        "GET",
        &format!("/api/threads/{thread}"),
        json!(null),
    )
    .await;
    let message = &body["messages"][0];
    let html = message["html"].as_str().unwrap();
    assert!(html.contains("display:none"));
    assert!(html.contains("width=\"600\""));
    assert!(html.contains("https://images.example/item.png"));
    assert!(message.get("raw").is_none());
    assert!(
        message["labels"]
            .as_array()
            .unwrap()
            .contains(&json!("UNREAD"))
    );
    let stored: String = sqlx::query_scalar("SELECT html FROM messages WHERE thread_id=?")
        .bind(&thread)
        .fetch_one(&state.pool)
        .await
        .unwrap();
    assert_eq!(stored, "<p>Old stripped HTML</p>");
}

#[tokio::test]
async fn hides_existing_inline_images_from_attachments_without_changing_saved_mail() {
    let (_temp, state) = setup().await;
    let raw = include_bytes!("fixtures/inline-logo.eml").to_vec();
    let thread = deliver(&state, raw).await;
    sqlx::query("UPDATE messages SET html='<img alt=\"Company logo\">' WHERE thread_id=?")
        .bind(&thread)
        .execute(&state.pool)
        .await
        .unwrap();
    let (status, body) = request(
        &api::router(state.clone()),
        "GET",
        &format!("/api/threads/{thread}"),
        json!(null),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let html = body["messages"][0]["html"].as_str().unwrap();
    assert!(html.contains("src=\"data:image/png;base64,iVBORw0KGgo"));
    assert_eq!(body["attachments"], json!([]));
    let stored_attachments: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM attachments")
        .fetch_one(&state.pool)
        .await
        .unwrap();
    assert_eq!(stored_attachments, 1);
    let stored: String = sqlx::query_scalar("SELECT html FROM messages WHERE thread_id=?")
        .bind(thread)
        .fetch_one(&state.pool)
        .await
        .unwrap();
    assert_eq!(stored, "<img alt=\"Company logo\">");
}

#[tokio::test]
async fn keeps_real_attachments_even_with_identical_names_and_bytes_to_inline_images() {
    let (_temp, state) = setup().await;
    let logo = include_str!("fixtures/inline-logo.eml");
    let image = logo
        .split("\n\n")
        .last()
        .unwrap()
        .split('\n')
        .next()
        .unwrap();
    let raw = format!(
        "From: Sam <sam@example.net>\r\nSubject: Inline logo and files\r\nContent-Type: multipart/mixed; boundary=outer\r\n\r\n--outer\r\nContent-Type: application/pdf\r\nContent-Disposition: attachment; filename=invoice.pdf\r\n\r\n%PDF-1.4\r\n--outer\r\n{logo}\r\n--outer\r\nContent-Type: image/png; name=Outlook-logo.png\r\nContent-Disposition: inline; filename=Outlook-logo.png\r\nContent-ID: <unused>\r\nContent-Transfer-Encoding: base64\r\n\r\n{image}\r\n--outer--\r\n"
    );
    let thread = deliver(&state, raw.into_bytes()).await;
    let app = api::router(state.clone());
    let (status, body) = request(&app, "GET", &format!("/api/threads/{thread}"), json!(null)).await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        body["messages"][0]["html"]
            .as_str()
            .unwrap()
            .contains("data:image/png;base64,")
    );
    let attachments = body["attachments"].as_array().unwrap();
    assert_eq!(attachments.len(), 2);
    assert!(
        attachments
            .iter()
            .any(|a| a["name"] == "invoice.pdf" && a["id"].as_str().unwrap().ends_with("-0"))
    );
    assert!(
        attachments
            .iter()
            .any(|a| a["name"] == "Outlook-logo.png" && a["id"].as_str().unwrap().ends_with("-2"))
    );
    for attachment in attachments {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!(
                        "/api/attachments/{}",
                        attachment["id"].as_str().unwrap()
                    ))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let content = response.into_body().collect().await.unwrap().to_bytes();
        assert!(!content.is_empty());
    }
}

#[tokio::test]
async fn mailbox_search_bulk_actions_labels_and_trash() {
    let (_temp, state) = setup().await;
    let first = deliver(
        &state,
        mail("Weekend plans", "first", "Coffee by the river"),
    )
    .await;
    deliver(&state, mail("Another note", "second", "Bring a camera")).await;
    let app = api::router(state.clone());
    let (status, page) = request(
        &app,
        "GET",
        "/api/threads?label=INBOX&category=CATEGORY_PERSONAL",
        json!(null),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(page["total"], 2);
    assert_eq!(page["threads"][0]["unread"], 1);
    let (_, found) = request(&app, "GET", "/api/threads?q=coffee", json!(null)).await;
    assert_eq!(found["total"], 1);
    let (_, found) = request(
        &app,
        "GET",
        "/api/threads?q=from%3Asam%40example.net%20subject%3AWeekend",
        json!(null),
    )
    .await;
    assert_eq!(found["total"], 1);
    let (_, label) = request(
        &app,
        "POST",
        "/api/labels",
        json!({"name":"Personal","color":"#2a6b53"}),
    )
    .await;
    for action in ["read", "star", "label", "archive"] {
        assert_eq!(
            request(
                &app,
                "POST",
                "/api/actions",
                json!({"thread_ids":[first],"action":action,"value":label["id"]})
            )
            .await
            .0,
            StatusCode::OK
        );
    }
    let (_, page) = request(&app, "GET", "/api/threads?label=INBOX", json!(null)).await;
    assert_eq!(page["total"], 1);
    let (_, page) = request(
        &app,
        "GET",
        &format!("/api/threads?label={}", label["id"].as_str().unwrap()),
        json!(null),
    )
    .await;
    assert_eq!(page["total"], 1);
    let thread_labels = page["threads"][0]["label_ids"].as_array().unwrap();
    assert!(thread_labels.contains(&label["id"]));
    assert!(thread_labels.contains(&json!("STARRED")));
    assert!(!thread_labels.contains(&json!("INBOX")));
    let (_, page) = request(&app, "GET", "/api/threads?label=ALL", json!(null)).await;
    assert_eq!(page["total"], 2);
    let (_, found) = request(&app, "GET", "/api/threads?q=label%3Apersonal", json!(null)).await;
    assert_eq!(found["total"], 1);
    let (_, conversation) =
        request(&app, "GET", &format!("/api/threads/{first}"), json!(null)).await;
    let message_labels = conversation["messages"][0]["labels"].as_array().unwrap();
    assert!(!message_labels.contains(&json!("UNREAD")));
    assert!(message_labels.contains(&json!("STARRED")));
    request(
        &app,
        "POST",
        "/api/actions",
        json!({"thread_ids":[first],"action":"trash"}),
    )
    .await;
    // Trash hides the conversation from its labels but keeps them, as in Gmail.
    let label_view = format!("/api/threads?label={}", label["id"].as_str().unwrap());
    assert_eq!(
        request(&app, "GET", &label_view, json!(null)).await.1["total"],
        0
    );
    assert_eq!(
        request(&app, "GET", "/api/threads?label=TRASH", json!(null))
            .await
            .1["total"],
        1
    );
    request(
        &app,
        "POST",
        "/api/actions",
        json!({"thread_ids":[first],"action":"inbox"}),
    )
    .await;
    assert_eq!(
        request(&app, "GET", &label_view, json!(null)).await.1["total"],
        1
    );
    assert_eq!(
        request(&app, "GET", "/api/threads?label=INBOX", json!(null))
            .await
            .1["total"],
        2
    );
    request(
        &app,
        "POST",
        "/api/actions",
        json!({"thread_ids":[first],"action":"trash"}),
    )
    .await;
    let (_, found) = request(&app, "GET", "/api/threads?q=coffee", json!(null)).await;
    assert_eq!(found["total"], 0);
    let (_, found) = request(
        &app,
        "GET",
        "/api/threads?q=coffee%20in%3Aanywhere",
        json!(null),
    )
    .await;
    assert_eq!(found["total"], 1);
    request(
        &app,
        "POST",
        "/api/actions",
        json!({"thread_ids":[first],"action":"delete"}),
    )
    .await;
    assert_eq!(
        request(&app, "GET", &format!("/api/threads/{first}"), json!(null))
            .await
            .0,
        StatusCode::NOT_FOUND
    );
}

#[tokio::test]
async fn draft_failure_retains_content_and_mailbox_identity_is_configurable() {
    let (_temp, state) = setup().await;
    let app = api::router(state.clone());
    let (status, account) = request(
        &app,
        "PUT",
        "/api/settings",
        json!({"name":"Jamie","email":"jamie@example.org"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(account["email"], "jamie@example.org");
    assert_eq!(db::account(&state.pool).await.unwrap().name, "Jamie");
    assert_eq!(
        request(
            &app,
            "PUT",
            "/api/settings",
            json!({"name":"Jamie","email":"bad"})
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    let (_, draft) = request(
        &app,
        "POST",
        "/api/drafts",
        json!({"to":"friend@example.net","subject":"Hello","body":"Keep this draft"}),
    )
    .await;
    let id = draft["id"].as_str().unwrap();
    let (status, error) = request(&app, "POST", &format!("/api/drafts/{id}/send"), json!({})).await;
    assert_eq!(status, StatusCode::BAD_GATEWAY);
    assert!(error["error"].as_str().unwrap().contains("SMTP_RELAY_HOST"));
    let (_, drafts) = request(&app, "GET", "/api/drafts", json!(null)).await;
    assert_eq!(drafts[0]["body"], "Keep this draft");
    let sending: bool = sqlx::query_scalar("SELECT sending FROM drafts WHERE id=?")
        .bind(id)
        .fetch_one(&state.pool)
        .await
        .unwrap();
    assert!(!sending);
    let sent: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM message_labels WHERE label_id='SENT'")
        .fetch_one(&state.pool)
        .await
        .unwrap();
    assert_eq!(sent, 0);
}

#[tokio::test]
async fn rejects_cross_site_mutations() {
    let (_temp, state) = setup().await;
    let app = api::router(state);
    let response = app
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/api/settings")
                .header("sec-fetch-site", "cross-site")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({"name":"Intruder","email":"intruder@example.net"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn sent_messages_remain_in_sent_when_archived_or_moved_to_inbox() {
    let (_temp, state) = setup().await;
    let raw = mail("Sent conversation", "sent-archive", "Hello");
    let mut parsed = state.pipeline.run(&raw, &envelope(), &[]).unwrap();
    parsed.labels = vec!["SENT".into()];
    let thread = mailthing::pipeline::persist(
        &state.pool,
        "sent-message",
        &raw,
        &envelope(),
        &parsed,
        db::now(),
        0,
    )
    .await
    .unwrap();
    let app = api::router(state);
    for action in ["archive", "inbox"] {
        request(
            &app,
            "POST",
            "/api/actions",
            json!({"thread_ids":[thread],"action":action}),
        )
        .await;
        assert_eq!(
            request(&app, "GET", "/api/threads?label=SENT", json!(null))
                .await
                .1["total"],
            1
        );
        assert_eq!(
            request(&app, "GET", "/api/threads?q=in%3Asent", json!(null))
                .await
                .1["total"],
            1
        );
    }
    request(
        &app,
        "POST",
        "/api/actions",
        json!({"thread_ids":[thread],"action":"trash"}),
    )
    .await;
    assert_eq!(
        request(&app, "GET", "/api/threads?label=SENT", json!(null))
            .await
            .1["total"],
        0
    );
}

#[tokio::test]
async fn pagination_preserves_total_when_the_last_page_becomes_empty() {
    let (_temp, state) = setup().await;
    for index in 0..51 {
        deliver(
            &state,
            mail(
                &format!("Page {index}"),
                &format!("page-{index}"),
                "A message",
            ),
        )
        .await;
    }
    let app = api::router(state);
    let (_, page) = request(&app, "GET", "/api/threads?label=INBOX&page=2", json!(null)).await;
    assert_eq!(page["total"], 51);
    assert_eq!(page["threads"].as_array().unwrap().len(), 1);
    request(
        &app,
        "POST",
        "/api/actions",
        json!({"thread_ids":[page["threads"][0]["id"]],"action":"archive"}),
    )
    .await;
    let (_, page) = request(&app, "GET", "/api/threads?label=INBOX&page=2", json!(null)).await;
    assert_eq!(page["total"], 50);
    assert!(page["threads"].as_array().unwrap().is_empty());
}

#[tokio::test]
async fn snoozed_mail_hides_then_returns_and_invalid_filters_are_rejected() {
    let (_temp, state) = setup().await;
    let id = deliver(&state, mail("Later", "later", "Tomorrow")).await;
    let app = api::router(state.clone());
    request(
        &app,
        "POST",
        "/api/actions",
        json!({"thread_ids":[id],"action":"snooze","until":db::now()+86400000}),
    )
    .await;
    assert_eq!(
        request(&app, "GET", "/api/threads?label=INBOX", json!(null))
            .await
            .1["total"],
        0
    );
    assert_eq!(
        request(&app, "GET", "/api/threads?label=SNOOZED", json!(null))
            .await
            .1["total"],
        1
    );
    assert_eq!(db::wake_snoozed(&state.pool).await.unwrap(), 0);
    sqlx::query("UPDATE messages SET snoozed_until=?")
        .bind(db::now() - 100)
        .execute(&state.pool)
        .await
        .unwrap();
    assert_eq!(db::wake_snoozed(&state.pool).await.unwrap(), 1);
    assert_eq!(
        request(&app, "GET", "/api/threads?label=SNOOZED", json!(null))
            .await
            .1["total"],
        0
    );
    assert_eq!(
        request(&app, "GET", "/api/threads?label=INBOX", json!(null))
            .await
            .1["total"],
        1
    );
    assert_eq!(request(&app,"POST","/api/rules",json!({"id":"","name":"Bad","field":"from","contains":"x","action":"category","value":"invalid","enabled":true})).await.0,StatusCode::BAD_REQUEST);
    assert_eq!(
        request(&app, "GET", "/api/threads?q=after%3Abad", json!(null))
            .await
            .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        request(
            &app,
            "POST",
            "/api/labels",
            json!({"name":"Bad","color":"#<img>!"})
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    // System labels can't be shadowed, deleted, or applied as user labels.
    assert_eq!(
        request(
            &app,
            "POST",
            "/api/labels",
            json!({"name":"inbox","color":"#2a6b53"})
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        request(&app, "DELETE", "/api/labels/INBOX", json!(null))
            .await
            .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        request(
            &app,
            "POST",
            "/api/actions",
            json!({"thread_ids":[id],"action":"unlabel","value":"INBOX"})
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    // A SQL-looking input is passed as a bound value, never as executable SQL.
    assert_eq!(
        request(
            &app,
            "GET",
            "/api/threads?q=from%3A%27%20OR%201%3D1",
            json!(null)
        )
        .await
        .0,
        StatusCode::OK
    );
}

#[tokio::test]
async fn imports_keep_original_time_mailbox_state_and_labels() {
    use base64::{Engine, engine::general_purpose::STANDARD};
    let (_temp, state) = setup().await;
    let app = api::router(state.clone());
    let current = deliver(&state, mail("Trip plans", "current", "This week")).await;
    let original = 1_700_000_000_000_i64;
    let (status, _) = request(
        &app,
        "POST",
        "/api/import",
        json!({"raw":STANDARD.encode(mail("Trip plans","old","Last year")),"received_at":original,"system_labels":["STARRED"],"labels":["Travel"," Receipts "]}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let (status, _) = request(
        &app,
        "POST",
        "/api/import",
        json!({"raw":STANDARD.encode(mail("Receipt","receipt","Paid")),"system_labels":["INBOX","UNREAD"],"labels":["receipts"]}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    while mailthing::pipeline::process_next(&state.pool, state.pipeline.clone())
        .await
        .unwrap()
    {}
    let old: (String, i64, String) = sqlx::query_as("SELECT thread_id,received_at,(SELECT group_concat(l.name,',') FROM (SELECT l.name FROM message_labels ml JOIN labels l ON l.id=ml.label_id WHERE ml.message_id=messages.id ORDER BY l.name) l) FROM messages WHERE message_id='<old@example.net>'")
        .fetch_one(&state.pool)
        .await
        .unwrap();
    assert_ne!(old.0, current);
    assert_eq!(old.1, original);
    // Archived and read; custom labels are kept.
    assert_eq!(old.2, "Receipts,Starred,Travel");
    let (_, labels) = request(&app, "GET", "/api/labels", json!(null)).await;
    let user: Vec<&str> = labels
        .as_array()
        .unwrap()
        .iter()
        .filter(|l| l["kind"] == "user")
        .map(|l| l["name"].as_str().unwrap())
        .collect();
    assert_eq!(user, ["Receipts", "Travel"]);
    let receipts = labels
        .as_array()
        .unwrap()
        .iter()
        .find(|l| l["name"] == "Receipts")
        .unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    let (_, found) = request(
        &app,
        "GET",
        &format!("/api/threads?label={receipts}"),
        json!(null),
    )
    .await;
    assert_eq!(found["total"], 2);
    let (_, inbox) = request(&app, "GET", "/api/threads?label=INBOX", json!(null)).await;
    assert_eq!(inbox["total"], 2);
    for bad in [
        json!({"raw":STANDARD.encode(mail("x","x","x")),"system_labels":["SNOOZED"]}),
        json!({"raw":STANDARD.encode(mail("x","x","x")),"received_at":0}),
        json!({"raw":STANDARD.encode(mail("x","x","x")),"labels":[""]}),
        json!({"raw":STANDARD.encode(mail("x","x","x")),"labels":["Inbox"]}),
    ] {
        assert_eq!(
            request(&app, "POST", "/api/import", bad).await.0,
            StatusCode::BAD_REQUEST
        );
    }
}

#[tokio::test]
async fn sorting_memory_tracks_only_explicit_corrections_and_can_be_cleared() {
    let (_temp, state) = setup().await;
    let mut thread_ids = Vec::new();
    for i in 0..14 {
        thread_ids.push(
            deliver(
                &state,
                mail(
                    &format!("Topic {i}"),
                    &format!("memory-{i}"),
                    "Keep this example",
                ),
            )
            .await,
        );
    }
    let app = api::router(state.clone());
    let (_, label) = request(
        &app,
        "POST",
        "/api/labels",
        json!({"name":"Work","color":"#123456"}),
    )
    .await;
    let id = label["id"].as_str().unwrap();
    let path = format!("/api/sorting/memories/{id}");
    assert_eq!(
        request(
            &app,
            "PUT",
            &path,
            json!({"guidance":"Work correspondence"})
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        request(
            &app,
            "PUT",
            "/api/sorting/memories/TRASH",
            json!({"guidance":"Delete all"})
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        request(&app, "PUT", &path, json!({"guidance":"x".repeat(2001)}))
            .await
            .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        request(
            &app,
            "POST",
            "/api/actions",
            json!({"thread_ids":thread_ids,"action":"label","value":id})
        )
        .await
        .0,
        StatusCode::OK
    );
    let (_, memories) = request(&app, "GET", "/api/sorting/memories", json!(null)).await;
    let memory = memories
        .as_array()
        .unwrap()
        .iter()
        .find(|m| m["label_id"] == id)
        .unwrap();
    assert_eq!(memory["example_count"], 12);
    assert_eq!(memory["examples"].as_array().unwrap().len(), 4);
    assert!(
        memory["examples"]
            .as_array()
            .unwrap()
            .iter()
            .all(|e| e["included"] == true)
    );
    request(
        &app,
        "POST",
        "/api/actions",
        json!({"thread_ids":[thread_ids[13]],"action":"unlabel","value":id}),
    )
    .await;
    let (_, memories) = request(&app, "GET", "/api/sorting/memories", json!(null)).await;
    let memory = memories
        .as_array()
        .unwrap()
        .iter()
        .find(|m| m["label_id"] == id)
        .unwrap();
    assert_eq!(memory["examples"][0]["included"], false);
    assert_eq!(
        request(
            &app,
            "POST",
            "/api/actions",
            json!({"thread_ids":[thread_ids[13]],"action":"category","value":"CATEGORY_SOCIAL"}),
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    let (_, memories) = request(&app, "GET", "/api/sorting/memories", json!(null)).await;
    assert!(
        memories
            .as_array()
            .unwrap()
            .iter()
            .all(|m| !m["label_id"].as_str().unwrap().starts_with("CATEGORY_"))
    );
    request(
        &app,
        "PUT",
        &path,
        json!({"guidance":"Work correspondence","clear_examples":true}),
    )
    .await;
    let (_, memories) = request(&app, "GET", "/api/sorting/memories", json!(null)).await;
    let memory = memories
        .as_array()
        .unwrap()
        .iter()
        .find(|m| m["label_id"] == id)
        .unwrap();
    assert_eq!(memory["example_count"], 0);
    assert_eq!(memory["guidance"], "Work correspondence");
}

#[tokio::test]
async fn spam_corrections_balance_memory_and_ordinary_inbox_moves_do_not_train() {
    let (_temp, state) = setup().await;
    let mut threads = Vec::new();
    for i in 0..28 {
        threads.push(
            deliver(
                &state,
                mail(
                    &format!("Spam example {i}"),
                    &format!("spam-example-{i}"),
                    "Example body",
                ),
            )
            .await,
        );
    }
    let app = api::router(state.clone());
    request(
        &app,
        "POST",
        "/api/actions",
        json!({"thread_ids":[threads[0]],"action":"inbox"}),
    )
    .await;
    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM sorting_examples WHERE label_id='SPAM'")
            .fetch_one(&state.pool)
            .await
            .unwrap();
    assert_eq!(count, 0);
    request(
        &app,
        "POST",
        "/api/actions",
        json!({"thread_ids":threads[..14],"action":"spam"}),
    )
    .await;
    request(
        &app,
        "POST",
        "/api/actions",
        json!({"thread_ids":threads[14..],"action":"not_spam"}),
    )
    .await;
    let (_, memories) = request(&app, "GET", "/api/sorting/memories", json!(null)).await;
    let spam = memories
        .as_array()
        .unwrap()
        .iter()
        .find(|m| m["label_id"] == "SPAM")
        .unwrap();
    assert_eq!(spam["example_count"], 24);
    assert_eq!(
        spam["examples"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|e| e["included"] == true)
            .count(),
        2
    );
    assert_eq!(
        spam["examples"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|e| e["included"] == false)
            .count(),
        2
    );
    request(
        &app,
        "POST",
        "/api/actions",
        json!({"thread_ids":[threads[13]],"action":"inbox"}),
    )
    .await;
    let included:bool=sqlx::query_scalar("SELECT e.included FROM sorting_examples e JOIN messages m ON m.id=e.message_id WHERE e.label_id='SPAM' AND m.thread_id=?").bind(&threads[13]).fetch_one(&state.pool).await.unwrap();
    assert!(!included);
    let (_, conversation) = request(
        &app,
        "GET",
        &format!("/api/threads/{}", threads[13]),
        json!(null),
    )
    .await;
    let labels = conversation["messages"][0]["labels"].as_array().unwrap();
    assert!(labels.iter().any(|l| l == "INBOX"));
    assert!(!labels.iter().any(|l| l == "SPAM"));
    assert_eq!(
        request(
            &app,
            "PUT",
            "/api/sorting/memories/SPAM",
            json!({"guidance":"Unwanted scams","clear_examples":true})
        )
        .await
        .0,
        StatusCode::OK
    );
    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM sorting_examples WHERE label_id='SPAM'")
            .fetch_one(&state.pool)
            .await
            .unwrap();
    assert_eq!(count, 0);
    assert_eq!(request(&app,"POST","/api/rules",json!({"id":"","name":"Trusted","field":"from","contains":"sam@example.net","action":"not_spam","value":"","enabled":true})).await.0,StatusCode::OK);
}

#[tokio::test]
async fn regenerates_legacy_previews_without_changing_saved_messages_or_mailbox_state() {
    let (_temp, state) = setup().await;
    let thread = deliver(&state, mail("Old preview", "old-preview", "Original body")).await;
    sqlx::query("UPDATE messages SET snippet='Old broken preview', text='Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nDelivery =E2=9C=93 &amp; pickup' WHERE thread_id=?")
        .bind(&thread).execute(&state.pool).await.unwrap();
    let (status, body) = request(
        &api::router(state.clone()),
        "GET",
        "/api/threads",
        json!(null),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["threads"][0]["snippet"], "Delivery ✓ & pickup");
    assert_eq!(body["threads"][0]["unread"], 1);
    assert!(body["threads"][0].get("text").is_none());
    assert!(body["threads"][0].get("html").is_none());
    let stored: String = sqlx::query_scalar("SELECT snippet FROM messages WHERE thread_id=?")
        .bind(&thread)
        .fetch_one(&state.pool)
        .await
        .unwrap();
    assert_eq!(stored, "Old broken preview");
}

#[tokio::test]
async fn tag_selection_is_atomic_preserves_system_state_and_teaches_only_custom_tags() {
    let (_temp, state) = setup().await;
    let thread = deliver(&state, mail("Tagged", "tag-picker", "A saved conversation")).await;
    let app = api::router(state.clone());
    let (_, a) = request(
        &app,
        "POST",
        "/api/labels",
        json!({"name":"Travel","color":"#808080"}),
    )
    .await;
    let (_, b) = request(
        &app,
        "POST",
        "/api/labels",
        json!({"name":"Receipts","color":"#808080"}),
    )
    .await;
    let selected =
        json!({"thread_ids":[thread],"action":"set_labels","label_ids":[a["id"],b["id"],a["id"]]});
    assert_eq!(
        request(&app, "POST", "/api/actions", selected).await.0,
        StatusCode::OK
    );
    let (_, conversation) =
        request(&app, "GET", &format!("/api/threads/{thread}"), json!(null)).await;
    let ids: Vec<_> = conversation["labels"]
        .as_array()
        .unwrap()
        .iter()
        .map(|l| l["id"].clone())
        .collect();
    for id in [
        json!("INBOX"),
        json!("UNREAD"),
        a["id"].clone(),
        b["id"].clone(),
    ] {
        assert!(ids.contains(&id));
    }
    let change = json!({"thread_ids":[thread],"action":"set_labels","label_ids":[b["id"]]});
    assert_eq!(
        request(&app, "POST", "/api/actions", change).await.0,
        StatusCode::OK
    );
    for invalid in [json!(["INBOX"]), json!([b["id"], "does-not-exist"])] {
        assert_eq!(
            request(
                &app,
                "POST",
                "/api/actions",
                json!({"thread_ids":[thread],"action":"set_labels","label_ids":invalid})
            )
            .await
            .0,
            StatusCode::BAD_REQUEST
        );
    }
    assert_eq!(
        request(
            &app,
            "POST",
            "/api/actions",
            json!({"thread_ids":[thread],"action":"set_labels"})
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    let (_, conversation) =
        request(&app, "GET", &format!("/api/threads/{thread}"), json!(null)).await;
    let tags: Vec<_> = conversation["labels"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|l| l["kind"] == "user")
        .map(|l| l["id"].clone())
        .collect();
    assert_eq!(
        tags,
        vec![b["id"].clone()],
        "Failed updates must not partially clear tags"
    );
    let included: bool =
        sqlx::query_scalar("SELECT included FROM sorting_examples WHERE label_id=?")
            .bind(a["id"].as_str().unwrap())
            .fetch_one(&state.pool)
            .await
            .unwrap();
    assert!(!included, "Removing a tag is a negative sorting example");
    assert_eq!(
        request(
            &app,
            "POST",
            "/api/actions",
            json!({"thread_ids":[thread],"action":"set_labels","label_ids":[]})
        )
        .await
        .0,
        StatusCode::OK
    );
    let (_, conversation) =
        request(&app, "GET", &format!("/api/threads/{thread}"), json!(null)).await;
    assert!(
        conversation["labels"]
            .as_array()
            .unwrap()
            .iter()
            .all(|l| l["kind"] != "user")
    );
    assert!(
        conversation["messages"][0]["labels"]
            .as_array()
            .unwrap()
            .contains(&json!("INBOX"))
    );
}

#[tokio::test]
async fn autofill_inputs_are_recent_bounded_read_only_and_exclude_hidden_or_imported_mail() {
    let (_temp, state) = setup().await;
    let current = deliver(
        &state,
        mail(
            "Your verification code",
            "code-current",
            "Your verification code is 123456",
        ),
    )
    .await;
    let hidden = deliver(
        &state,
        mail("Your login code", "code-spam", "Your login code is 234567"),
    )
    .await;
    let old = deliver(
        &state,
        mail("Your passcode", "code-old", "Your passcode is 345678"),
    )
    .await;
    sqlx::query("UPDATE messages SET received_at=? WHERE thread_id=?")
        .bind(mailthing::db::now() - 601_000)
        .bind(&old)
        .execute(&state.pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO message_labels(message_id,label_id) SELECT id,'SPAM' FROM messages WHERE thread_id=?")
        .bind(&hidden)
        .execute(&state.pool)
        .await
        .unwrap();
    db::enqueue_import(
        &state.pool,
        mail(
            "Imported code",
            "imported-code",
            "Your verification code is 456789",
        ),
        &envelope(),
        Some(&mailthing::models::ImportState::default()),
    )
    .await
    .unwrap();
    mailthing::pipeline::process_next(&state.pool, state.pipeline.clone())
        .await
        .unwrap();
    let app = api::router(state.clone());
    let (status, response) = request(&app, "GET", "/api/autofill/messages", json!(null)).await;
    assert_eq!(status, StatusCode::OK);
    let messages = response["messages"].as_array().unwrap();
    assert_eq!(messages.len(), 1);
    let message_id: String = sqlx::query_scalar("SELECT id FROM messages WHERE thread_id=?")
        .bind(&current)
        .fetch_one(&state.pool)
        .await
        .unwrap();
    assert_eq!(messages[0]["id"], message_id);
    assert_eq!(
        messages[0]["text"].as_str().unwrap().trim(),
        "Your verification code is 123456"
    );
    assert!(messages[0].get("raw").is_none());
    let unread: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM message_labels WHERE message_id IN(SELECT id FROM messages WHERE thread_id=?) AND label_id='UNREAD'",
    )
    .bind(&current)
    .fetch_one(&state.pool)
    .await
    .unwrap();
    assert_eq!(unread, 1);
    for n in 0..42 {
        deliver(
            &state,
            mail(
                "Your verification code",
                &format!("code-bounded-{n}"),
                &"x".repeat(13000),
            ),
        )
        .await;
    }
    let (_, response) = request(&app, "GET", "/api/autofill/messages", json!(null)).await;
    let messages = response["messages"].as_array().unwrap();
    assert_eq!(messages.len(), 40);
    assert!(
        messages
            .iter()
            .all(|m| m["text"].as_str().unwrap().chars().count() <= 12000)
    );
}
