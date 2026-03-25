## Backlog — Cantina (React PWA + Node + PostgreSQL)

### Convenções

* **Prioridade:** P0 (obrigatório MVP), P1 (depois do MVP), P2 (futuro)
* **Fases:** F0 (Fundação), F1 (MVP), F2 (Operação inteligente), F3 (Antifalha offline), F4 (Pagamentos/UX)

---

## EPIC F0-01 — Fundação do Projeto (Infra + Padrões)

| ID      | História                                                     | Perfil | Pri |
| ------- | ------------------------------------------------------------ | ------ | --- |
| F0-01.1 | Criar monorepo (front/back) com padrões de lint, format, env | Dev    | P0  |
| F0-01.2 | Docker Compose (api + db + adminer/pgadmin)                  | Dev    | P0  |
| F0-01.3 | CI básico (build + lint + testes)                            | Dev    | P0  |
| F0-01.4 | Pipeline de migrations (Prisma/Knex) e seed inicial          | Dev    | P0  |
| F0-01.5 | Logging estruturado + correlação de requestId                | Dev    | P0  |
| F0-01.6 | Configuração de CORS/HTTPS-ready + variáveis seguras         | Dev    | P0  |

**Critérios de aceite (F0-01.x)**

* Rodar `docker compose up` sobe API + Postgres.
* Migrations e seed rodam sem intervenção.
* Front builda e consome API em dev.

---

## EPIC F0-02 — Autenticação e RBAC

| ID      | História                                                          | Perfil  | Pri |
| ------- | ----------------------------------------------------------------- | ------- | --- |
| F0-02.1 | Como usuário, quero login para acessar o sistema                  | Todos   | P0  |
| F0-02.2 | Como admin, quero criar usuários internos (CASHIER/KITCHEN/ADMIN) | Admin   | P0  |
| F0-02.3 | Como sistema, quero RBAC por rotas e recursos                     | Sistema | P0  |
| F0-02.4 | Como usuário, quero recuperação de senha (email/OTP simples)      | Todos   | P1  |
| F0-02.5 | Como sistema, quero bloquear usuários inativos                    | Sistema | P0  |

**AC principais**

* JWT/sessão válida, expiração definida.
* Rotas protegidas por role.
* Admin consegue criar e desativar usuário interno.

---

## EPIC F1-01 — Catálogo (CLIENT) + Exibição do Cardápio

| ID      | História                                                      | Perfil  | Pri |
| ------- | ------------------------------------------------------------- | ------- | --- |
| F1-01.1 | Como acadêmico, quero ver categorias e itens disponíveis      | Client  | P0  |
| F1-01.2 | Como acadêmico, quero buscar item por nome                    | Client  | P1  |
| F1-01.3 | Como acadêmico, quero ver detalhes do item (preço, descrição) | Client  | P0  |
| F1-01.4 | Como sistema, quero ocultar itens inativos/sem estoque        | Sistema | P0  |

**AC principais**

* Itens indisponíveis não aparecem ou aparecem desabilitados (regra definida no front).
* Preço exibido corretamente (centavos → moeda).

---

## EPIC F1-02 — Carrinho e Checkout (CLIENT)

| ID      | História                                                           | Perfil  | Pri |
| ------- | ------------------------------------------------------------------ | ------- | --- |
| F1-02.1 | Como acadêmico, quero adicionar/remover itens do carrinho          | Client  | P0  |
| F1-02.2 | Como acadêmico, quero alterar quantidade                           | Client  | P0  |
| F1-02.3 | Como acadêmico, quero confirmar pedido                             | Client  | P0  |
| F1-02.4 | Como acadêmico, quero escolher método de pagamento (exibir opções) | Client  | P0  |
| F1-02.5 | Como sistema, quero calcular total do pedido no backend            | Sistema | P0  |

**AC principais**

* Backend recalcula total (não confia no front).
* Pedido confirmado cria itens e total em transação.

---

## EPIC F1-03 — Ticket (QR + Código Curto) e Regras de Uso Único

| ID      | História                                                                | Perfil  | Pri |
| ------- | ----------------------------------------------------------------------- | ------- | --- |
| F1-03.1 | Como sistema, quero gerar ticket com token assinado ao confirmar pedido | Sistema | P0  |
| F1-03.2 | Como acadêmico, quero ver QR e código curto do meu pedido               | Client  | P0  |
| F1-03.3 | Como sistema, quero ticket com expiração configurável                   | Sistema | P0  |
| F1-03.4 | Como sistema, quero impedir reutilização do ticket                      | Sistema | P0  |
| F1-03.5 | Como sistema, quero endpoint idempotente para “consumir ticket”         | Sistema | P0  |

**AC principais**

* Ticket único por pedido (MVP).
* Token inválido/expirado retorna erro claro.
* Consumir 2x retorna “já consumido” sem duplicar ações.

---

## EPIC F1-04 — App Cantina (CASHIER): Validação e Retirada

| ID      | História                                                   | Perfil  | Pri |
| ------- | ---------------------------------------------------------- | ------- | --- |
| F1-04.1 | Como caixa, quero abrir câmera direto para validar QR      | Cashier | P0  |
| F1-04.2 | Como caixa, quero digitar código curto se câmera falhar    | Cashier | P0  |
| F1-04.3 | Como caixa, quero ver resumo do pedido antes de confirmar  | Cashier | P0  |
| F1-04.4 | Como caixa, quero confirmar retirada e consumir ticket     | Cashier | P0  |
| F1-04.5 | Como caixa, quero marcar “pago na retirada” no mesmo fluxo | Cashier | P0  |

**AC principais**

* Tela de validação com latência baixa.
* Fluxo em 2 passos: validar → confirmar.
* Registro de quem consumiu (user interno).

---

## EPIC F1-05 — Venda Balcão (PDV Rápido)

| ID      | História                                                            | Perfil  | Pri |
| ------- | ------------------------------------------------------------------- | ------- | --- |
| F1-05.1 | Como caixa, quero montar venda com itens e quantidade               | Cashier | P0  |
| F1-05.2 | Como caixa, quero escolher método de pagamento e finalizar          | Cashier | P0  |
| F1-05.3 | Como sistema, quero registrar venda balcão como pedido “COUNTER”    | Sistema | P0  |
| F1-05.4 | Como sistema, quero baixar estoque e registrar movimento financeiro | Sistema | P0  |

**AC principais**

* Venda balcão entra em relatórios e no caixa do dia.
* Não gera ticket para o cliente (ou gera e já consome automaticamente — escolha do MVP).

---

## EPIC F1-06 — Caixa (Abertura/Fechamento) + Movimentações

| ID      | História                                              | Perfil  | Pri |
| ------- | ----------------------------------------------------- | ------- | --- |
| F1-06.1 | Como caixa, quero abrir caixa com troco inicial       | Cashier | P0  |
| F1-06.2 | Como caixa, quero fechar caixa com totais por método  | Cashier | P0  |
| F1-06.3 | Como caixa, quero registrar sangria/retirada de caixa | Cashier | P1  |
| F1-06.4 | Como admin, quero ver histórico de caixas por dia     | Admin   | P1  |

**AC principais**

* Não fecha caixa sem estar aberto.
* Fechamento calcula totais por método e canal (online/balcão).

---

## EPIC F1-07 — Estoque Simples

| ID      | História                                                                     | Perfil  | Pri |
| ------- | ---------------------------------------------------------------------------- | ------- | --- |
| F1-07.1 | Como admin, quero definir item com estoque controlado/ilimitado              | Admin   | P0  |
| F1-07.2 | Como sistema, quero reservar/baixar estoque em transação ao confirmar pedido | Sistema | P0  |
| F1-07.3 | Como sistema, quero impedir venda/pedido com estoque insuficiente            | Sistema | P0  |
| F1-07.4 | Como admin, quero ajustar estoque manualmente (entrada/ajuste)               | Admin   | P1  |

**AC principais**

* Sem race condition (transação + lock/constraint).
* Itens sem estoque ficam indisponíveis.

---

## EPIC F1-08 — Admin: CRUD de Itens/Categorias + Configurações Básicas

| ID      | História                                                               | Perfil | Pri |
| ------- | ---------------------------------------------------------------------- | ------ | --- |
| F1-08.1 | Como admin, quero criar/editar/remover categorias                      | Admin  | P0  |
| F1-08.2 | Como admin, quero criar/editar/remover itens (preço, ativo, categoria) | Admin  | P0  |
| F1-08.3 | Como admin, quero configurar horários e janela padrão de retirada      | Admin  | P0  |
| F1-08.4 | Como admin, quero mensagem de aviso no app (banner)                    | Admin  | P1  |

**AC principais**

* Itens inativos somem do cardápio.
* Configurações aplicam imediatamente (cache com invalidação simples se houver).

---

## EPIC F1-09 — Pedidos: Histórico, Status, Cancelamento e Expiração

| ID      | História                                                              | Perfil        | Pri |
| ------- | --------------------------------------------------------------------- | ------------- | --- |
| F1-09.1 | Como acadêmico, quero ver “meus pedidos” e status                     | Client        | P0  |
| F1-09.2 | Como sistema, quero expirar ticket/pedido ao passar da janela         | Sistema       | P0  |
| F1-09.3 | Como admin/caixa, quero cancelar pedido antes de consumir (com regra) | Admin/Cashier | P1  |
| F1-09.4 | Como sistema, quero devolver estoque quando pedido expira/cancela     | Sistema       | P0  |

**AC principais**

* Expiração automatizada (job/cron) muda status + libera estoque.
* Cancelamento registra audit log.

---

## EPIC F1-10 — Auditoria e Observabilidade (Antifalha mínima)

| ID      | História                                                                     | Perfil  | Pri |
| ------- | ---------------------------------------------------------------------------- | ------- | --- |
| F1-10.1 | Como sistema, quero audit log de ações críticas (ticket/estoque/preço/caixa) | Sistema | P0  |
| F1-10.2 | Como admin, quero consultar logs por data/usuário/ação                       | Admin   | P1  |
| F1-10.3 | Como sistema, quero rate limit em validação por código curto                 | Sistema | P0  |

**AC principais**

* Toda confirmação de retirada grava ator, data e payload mínimo.
* Rate limit impede brute force de códigos.

---

# FASE 2 (Pós-MVP) — Operação Inteligente

## EPIC F2-01 — Painel Cozinha (Produção)

| ID      | História                                                      | Perfil  | Pri |
| ------- | ------------------------------------------------------------- | ------- | --- |
| F2-01.1 | Como cozinha, quero ver fila de pedidos confirmados           | Kitchen | P1  |
| F2-01.2 | Como cozinha, quero mudar status para “em preparo” e “pronto” | Kitchen | P1  |
| F2-01.3 | Como caixa, quero ver status atualizado na validação          | Cashier | P1  |

**AC principais**

* Status só avança (regra de transição).
* Painel ordena por tempo/priority.

## EPIC F2-02 — Anti-fila (Capacidade por Janela)

| ID      | História                                                     | Perfil  | Pri |
| ------- | ------------------------------------------------------------ | ------- | --- |
| F2-02.1 | Como admin, quero configurar limite de pedidos por janela    | Admin   | P1  |
| F2-02.2 | Como acadêmico, quero escolher janela disponível no checkout | Client  | P1  |
| F2-02.3 | Como sistema, quero bloquear janela lotada                   | Sistema | P1  |

## EPIC F2-03 — Relatórios Melhorados

| ID      | História                                                           | Perfil | Pri |
| ------- | ------------------------------------------------------------------ | ------ | --- |
| F2-03.1 | Como admin, quero vendas por período (dia/semana/mês)              | Admin  | P1  |
| F2-03.2 | Como admin, quero itens mais vendidos e ticket médio               | Admin  | P1  |
| F2-03.3 | Como admin, quero relatório de no-show (confirmado e não retirado) | Admin  | P1  |

---

# FASE 3 — Antifalha Offline (Cantina)

## EPIC F3-01 — PWA Offline para Validação (CASHIER)

| ID      | História                                                               | Perfil  | Pri |
| ------- | ---------------------------------------------------------------------- | ------- | --- |
| F3-01.1 | Como caixa, quero validar tickets mesmo sem internet (cache do dia)    | Cashier | P1  |
| F3-01.2 | Como sistema, quero sincronizar consumos quando a internet voltar      | Sistema | P1  |
| F3-01.3 | Como sistema, quero resolver conflitos (duplo consumo) com regra única | Sistema | P1  |

**AC principais**

* Modo offline valida apenas tickets previamente baixados.
* Sync não duplica consumo (idempotência + conflito controlado).

---

# FASE 4 — Pagamentos e UX

## EPIC F4-01 — Integração de Pagamentos (Pix Dinâmico/Gateway)

| ID      | História                                                                    | Perfil | Pri |
| ------- | --------------------------------------------------------------------------- | ------ | --- |
| F4-01.1 | Como acadêmico, quero pagar via Pix e o pedido ficar “pago” automaticamente | Client | P2  |
| F4-01.2 | Como admin, quero conciliar pagamentos e estornos                           | Admin  | P2  |

## EPIC F4-02 — Notificações e Totem

| ID      | História                                                       | Perfil  | Pri |
| ------- | -------------------------------------------------------------- | ------- | --- |
| F4-02.1 | Como acadêmico, quero notificação quando pedido estiver pronto | Client  | P2  |
| F4-02.2 | Como cantina, quero uma tela/TV mostrando “pedidos prontos”    | Cantina | P2  |

---

## “Sprint Plan” sugerido (para sair rápido)

* **Sprint 0 (F0):** F0-01 + F0-02
* **Sprint 1 (MVP):** F1-01 + F1-02 + F1-03
* **Sprint 2 (MVP):** F1-04 + F1-05
* **Sprint 3 (MVP):** F1-06 + F1-07 + F1-08
* **Sprint 4 (MVP hardening):** F1-09 + F1-10 + ajustes de UX/performance
