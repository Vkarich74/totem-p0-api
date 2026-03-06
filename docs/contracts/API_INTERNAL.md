\# TOTEM INTERNAL API CONTRACT

FREEZE DATE: 2026-03-06



Этот документ фиксирует внутренний API между Backend и SDK.

Любое изменение этих endpoint требует изменения версии API.



----------------------------------

ARCHITECTURE

----------------------------------



Backend (Railway)

↓

SDK SPA (Cloudflare)

↓

Odoo Website (embed container)



SDK зависит от этих endpoint. Их удаление ломает систему.



----------------------------------

MASTER API

----------------------------------



GET /internal/masters/:slug



Возвращает мастера.



Response



{

&nbsp; ok: true,

&nbsp; master: {

&nbsp;   id,

&nbsp;   name,

&nbsp;   slug

&nbsp; }

}



----------------------------------



GET /internal/masters/:slug/metrics



Response



{

&nbsp; ok: true,

&nbsp; metrics: {

&nbsp;   bookings\_today,

&nbsp;   bookings\_week,

&nbsp;   clients\_total,

&nbsp;   revenue\_today,

&nbsp;   revenue\_month

&nbsp; }

}



----------------------------------



GET /internal/masters/:slug/bookings



Response



{

&nbsp; ok: true,

&nbsp; bookings: \[]

}



----------------------------------



GET /internal/masters/:slug/clients



Response



{

&nbsp; ok: true,

&nbsp; clients: \[]

}



----------------------------------

SALON OWNER API

----------------------------------



GET /internal/salons/:slug/metrics



Response



{

&nbsp; ok: true,

&nbsp; metrics: {

&nbsp;   bookings\_today,

&nbsp;   bookings\_week,

&nbsp;   clients\_total,

&nbsp;   revenue\_today,

&nbsp;   revenue\_month

&nbsp; }

}



----------------------------------



GET /internal/salons/:slug/masters



Response



{

&nbsp; ok: true,

&nbsp; masters: \[]

}



----------------------------------



GET /internal/salons/:slug/clients



Response



{

&nbsp; ok: true,

&nbsp; clients: \[]

}



----------------------------------



GET /internal/salons/:slug/bookings



Response



{

&nbsp; ok: true,

&nbsp; bookings: \[]

}



----------------------------------

CONTRACT RULES

----------------------------------



1\. Эти endpoint нельзя удалять.

2\. Нельзя менять response формат.

3\. Если endpoint меняется — создаётся новая версия API.

4\. SDK использует только этот контракт.



----------------------------------

DEPLOY RULE

----------------------------------



Перед deploy backend обязательно проверять:



/internal/salons/:slug/metrics

/internal/masters/:slug/metrics



Если один из них 404 — deploy запрещён.

